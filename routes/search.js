import express from 'express';
import mongoose from 'mongoose';
import Snapshot from '../models/Snapshot.js';
import Site from '../models/Site.js';

const router = express.Router();

// Search staff members across all sites
router.get('/staff/search', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      title,
      category,
      site,
      page = 1,
      limit = 20,
      exactMatch = false
    } = req.query;

    // Build search query
    const searchQuery = {};
    
    // Name search (case-insensitive, partial match by default)
    if (name) {
      if (exactMatch === 'true') {
        searchQuery['categories.members.name'] = name;
      } else {
        searchQuery['categories.members.name'] = {
          $regex: name,
          $options: 'i'
        };
      }
    }

    // Email search
    if (email) {
      if (exactMatch === 'true') {
        searchQuery['categories.members.emails'] = email;
      } else {
        searchQuery['categories.members.emails'] = {
          $regex: email,
          $options: 'i'
        };
      }
    }

    // Phone search
    if (phone) {
      if (exactMatch === 'true') {
        searchQuery['categories.members.phones'] = phone;
      } else {
        searchQuery['categories.members.phones'] = {
          $regex: phone.replace(/[^0-9]/g, ''), // Remove non-numeric characters for better matching
          $options: 'i'
        };
      }
    }

    // Title search
    if (title) {
      searchQuery['categories.members.title'] = {
        $regex: title,
        $options: 'i'
      };
    }

    // Category search
    if (category) {
      searchQuery['categories.name'] = {
        $regex: category,
        $options: 'i'
      };
    }

    // Site filter
    if (site) {
      const siteDoc = await Site.findOne({
        $or: [
          { baseUrl: { $regex: site, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(site) ? new mongoose.Types.ObjectId(site) : null }
        ]
      });
      
      if (siteDoc) {
        searchQuery.site = siteDoc._id;
      } else {
        return res.json({
          success: true,
          results: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalResults: 0,
            hasNext: false,
            hasPrev: false
          }
        });
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Aggregate query to search across nested arrays and get individual staff members
    const aggregationPipeline = [
      // Match snapshots that have the search criteria
      { $match: searchQuery },
      
      // Unwind categories to search within them
      { $unwind: '$categories' },
      
      // Unwind members to get individual staff members
      { $unwind: '$categories.members' },
      
      // Match again at the member level to filter specific members
      {
        $match: {
          ...(name && {
            'categories.members.name': exactMatch === 'true' 
              ? name 
              : { $regex: name, $options: 'i' }
          }),
          ...(email && {
            'categories.members.emails': exactMatch === 'true'
              ? email
              : { $regex: email, $options: 'i' }
          }),
          ...(phone && {
            'categories.members.phones': exactMatch === 'true'
              ? phone
              : { $regex: phone.replace(/[^0-9]/g, ''), $options: 'i' }
          }),
          ...(title && {
            'categories.members.title': { $regex: title, $options: 'i' }
          })
        }
      },
      
      // Lookup site information
      {
        $lookup: {
          from: 'sites',
          localField: 'site',
          foreignField: '_id',
          as: 'siteInfo'
        }
      },
      
      // Add site information to each result
      {
        $addFields: {
          siteInfo: { $arrayElemAt: ['$siteInfo', 0] }
        }
      },
      
      // Project only the fields we need
      {
        $project: {
          _id: 0,
          staffMember: '$categories.members',
          category: '$categories.name',
          snapshotDate: 1,
          site: {
            _id: '$siteInfo._id',
            baseUrl: '$siteInfo.baseUrl',
            staffDirectory: '$siteInfo.staffDirectory'
          }
        }
      },
      
      // Sort by most recent snapshot first
      { $sort: { snapshotDate: -1 } },
      
      // Group by fingerprint to find unique staff members across snapshots
      {
        $group: {
          _id: '$staffMember.fingerprint',
          staffMember: { $first: '$staffMember' },
          category: { $first: '$category' },
          sites: { 
            $addToSet: {
              siteId: '$site._id',
              baseUrl: '$site.baseUrl',
              staffDirectory: '$site.staffDirectory',
              snapshotDate: '$snapshotDate'
            }
          },
          latestSeen: { $max: '$snapshotDate' },
          firstSeen: { $min: '$snapshotDate' }
        }
      },
      
      // Project final format
      {
        $project: {
          _id: 0,
          fingerprint: '$_id',
          name: '$staffMember.name',
          title: '$staffMember.title',
          emails: '$staffMember.emails',
          phones: '$staffMember.phones',
          profileUrl: '$staffMember.profileUrl',
          socials: '$staffMember.socials',
          description: '$staffMember.description',
          category: '$category',
          sites: '$sites',
          latestSeen: '$latestSeen',
          firstSeen: '$firstSeen'
        }
      },
      
      // Final sort by latest seen date
      { $sort: { latestSeen: -1 } }
    ];

    // Execute search with pagination
    const results = await Snapshot.aggregate([
      ...aggregationPipeline,
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    // Get total count for pagination
    const countPipeline = [
      ...aggregationPipeline,
      { $count: 'totalCount' }
    ];
    
    const countResult = await Snapshot.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      success: true,
      results,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalResults: totalCount,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      searchCriteria: {
        name,
        email,
        phone,
        title,
        category,
        site,
        exactMatch: exactMatch === 'true'
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get search suggestions for autocomplete
router.get('/staff/suggestions', async (req, res) => {
  try {
    const { q, field = 'name' } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const validFields = ['name', 'title', 'category', 'email'];
    if (!validFields.includes(field)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid field for suggestions'
      });
    }

    let searchField = '';
    if (field === 'email') {
      searchField = 'categories.members.emails';
    } else {
      searchField = `categories.members.${field}`;
    }

    const suggestions = await Snapshot.aggregate([
      { $unwind: '$categories' },
      { $unwind: '$categories.members' },
      {
        $match: {
          [searchField]: {
            $regex: q,
            $options: 'i'
          }
        }
      },
      {
        $group: {
          _id: field === 'email' ? '$categories.members.emails' : `$categories.members.${field}`,
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          value: '$_id',
          count: 1
        }
      }
    ]);

    res.json({
      success: true,
      suggestions: suggestions.map(s => s.value)
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;