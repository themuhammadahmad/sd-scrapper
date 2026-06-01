// utils/diffEngine.js

/**
 * Calculates the similarity between two strings (0 to 1)
 * Using Levenshtein distance algorithm
 */
function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return 1.0 - matrix[len1][len2] / Math.max(len1, len2);
}

/**
 * Normalizes a snapshot into a flat list of unique entities
 */
function flattenSnapshot(snapshot) {
    const people = [];
    
    snapshot.categories.forEach(cat => {
        cat.members.forEach(m => {
            const member = JSON.parse(JSON.stringify(m)); // Ensure it's a plain object
            
            // Clean email for matching
            const cleanEmail = (email) => (email || '').toLowerCase().replace('mailto:', '').trim();
            const memberEmail = member.emails?.length > 0 ? cleanEmail(member.emails[0]) : null;

            const existing = people.find(p => {
                const pEmail = p.emails?.length > 0 ? cleanEmail(p.emails[0]) : null;
                const sameEmail = memberEmail && pEmail && memberEmail === pEmail;
                
                const sameUrl = p.profileUrl && member.profileUrl && 
                               p.profileUrl.replace(/\/$/, '') === member.profileUrl.replace(/\/$/, '');
                
                const sameNameTitle = (p.name?.toLowerCase().trim() === member.name?.toLowerCase().trim()) && 
                                      (p.title?.toLowerCase().trim() === member.title?.toLowerCase().trim()) &&
                                      (p.name);
                return sameEmail || sameUrl || sameNameTitle;
            });

            if (existing) {
                const catName = cat.name.toLowerCase().trim();
                if (!existing.allCategories.map(c => c.toLowerCase().trim()).includes(catName)) {
                    existing.allCategories.push(cat.name);
                }
                // Pick the longest title/name as the 'stable' one
                if (member.title && member.title.length > (existing.title || '').length) {
                    existing.title = member.title;
                }
                if (member.name && member.name.length > (existing.name || '').length) {
                    existing.name = member.name;
                }
            } else {
                people.push({
                    ...member,
                    allCategories: [cat.name],
                    originalCategory: cat.name
                });
            }
        });
    });
    return people;
}

/**
 * Compares two snapshots using Fuzzy Matching
 */
export function compareSnapshotsFuzzy(oldSnap, newSnap) {
    const beforeList = flattenSnapshot(oldSnap);
    const afterList = flattenSnapshot(newSnap);
    
    const added = [];
    const removed = [];
    const updated = [];
    
    const linkedAfterIndices = new Set();
    const linkedBeforeIndices = new Set();

    // Helper to clean email
    const cleanE = (email) => (email || '').toLowerCase().replace('mailto:', '').trim();

    // 1. High Confidence Match (Email or URL)
    beforeList.forEach((before, bIdx) => {
        const bEmail = before.emails?.length > 0 ? cleanE(before.emails[0]) : null;
        
        const matchIdx = afterList.findIndex((after, aIdx) => {
            if (linkedAfterIndices.has(aIdx)) return false;
            
            const aEmail = after.emails?.length > 0 ? cleanE(after.emails[0]) : null;
            if (bEmail && aEmail && bEmail === aEmail) return true;
            
            if (before.profileUrl && after.profileUrl && 
                before.profileUrl.replace(/\/$/, '') === after.profileUrl.replace(/\/$/, '')) return true;
            
            return false;
        });

        if (matchIdx !== -1) {
            linkRecords(bIdx, matchIdx);
        }
    });

    // 2. Fuzzy Name Match for remaining
    beforeList.forEach((before, bIdx) => {
        if (linkedBeforeIndices.has(bIdx)) return;
        
        let bestMatchIdx = -1;
        let bestScore = 0;

        afterList.forEach((after, aIdx) => {
            if (linkedAfterIndices.has(aIdx)) return;
            const score = getSimilarity(before.name, after.name);
            if (score > 0.85 && score > bestScore) {
                bestScore = score;
                bestMatchIdx = aIdx;
            }
        });

        if (bestMatchIdx !== -1) {
            linkRecords(bIdx, bestMatchIdx);
        }
    });

    function linkRecords(bIdx, aIdx) {
        linkedBeforeIndices.add(bIdx);
        linkedAfterIndices.add(aIdx);
        
        const before = beforeList[bIdx];
        const after = afterList[aIdx];
        
        if (!before || !after) return; // Safety check

        const diffs = {};
        let hasChanges = false;

        // Compare fields
        ['name', 'title', 'description'].forEach(field => {
            const bVal = (before[field] || '').toString().trim();
            const aVal = (after[field] || '').toString().trim();
            if (bVal !== aVal) {
                diffs[field] = { before: before[field], after: after[field] };
                hasChanges = true;
            }
        });

        // Compare categories (Case-insensitive)
        const catBefore = before.allCategories.map(c => c.toLowerCase().trim()).sort().join(',');
        const catAfter = after.allCategories.map(c => c.toLowerCase().trim()).sort().join(',');
        if (catBefore !== catAfter) {
            diffs.categories = { before: before.allCategories, after: after.allCategories };
            hasChanges = true;
        }

        if (hasChanges) {
            // DEBUG: Print the records to see why name is missing
            console.log(`🔍 [UPDATE DEBUG] Linking ${before.name || 'NO_NAME'} to ${after.name || 'NO_NAME'}`);
            if (!after.name) console.log('⚠️ AFTER record has no name field! Data:', JSON.stringify(after).slice(0, 200));

            updated.push({
                before: before,
                after: after,
                diffs: diffs,
                fingerprint: before.fingerprint || after.fingerprint
            });
        }
    }

    // 3. Final added/removed
    beforeList.forEach((p, i) => {
        if (!linkedBeforeIndices.has(i)) removed.push(p);
    });
    
    afterList.forEach((p, i) => {
        if (!linkedAfterIndices.has(i)) added.push(p);
    });

    return { added, removed, updated };
}
