const fs = require('fs');

try {
  const ventesHtml = fs.readFileSync('ventes.html', 'utf8');
  const ventesJs = fs.readFileSync('ventes.js', 'utf8');
  const tombolaHtml = fs.readFileSync('tombola.html', 'utf8');
  const tombolaJs = fs.readFileSync('tombola.js', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  console.log('--- Verification Report ---');

  // Sales Verification
  const hasImportBtn = ventesHtml.includes('id="importCsvBtn"');
  const hasDedupeBtn = ventesHtml.includes('id="dedupeBtn"');
  const hasDeleteSelectedBtn = ventesHtml.includes('id="deleteSelectedBtn"');
  const hasThSelect = ventesHtml.includes('id="thSelect"');

  console.log('Sales HTML Elements:');
  console.log(`- Import Btn: ${hasImportBtn}`);
  console.log(`- Dedupe Btn: ${hasDedupeBtn}`);
  console.log(`- Delete Selected Btn: ${hasDeleteSelectedBtn}`);
  console.log(`- Multi-select Header: ${hasThSelect}`);

  const hasDedupeLogic = ventesJs.includes('async function dedupeSales()');
  const hasMultiDeleteLogic = ventesJs.includes('async function deleteSelected()');
  const hasDateHeuristic = ventesJs.includes('Heuristic: DD/MM vs MM/DD. Prefer past date.');
  const hasAdminCheck = ventesJs.includes('if(CACHE.role === "admin")');

  console.log('\nSales JS Logic:');
  console.log(`- Dedupe Logic: ${hasDedupeLogic}`);
  console.log(`- Multi-delete Logic: ${hasMultiDeleteLogic}`);
  console.log(`- Date Heuristic: ${hasDateHeuristic}`);
  console.log(`- Admin RBAC check: ${hasAdminCheck}`);

  // Tombola Verification
  const hasSearchInput = tombolaHtml.includes('id="pName"');
  const hasSearchDropdown = tombolaHtml.includes('id="pSearchDropdown"');

  console.log('\nTombola HTML Elements:');
  console.log(`- Search Input: ${hasSearchInput}`);
  console.log(`- Search Dropdown: ${hasSearchDropdown}`);

  const hasSearchLogic = tombolaJs.includes('function updateSearchDropdown()');
  const hasDrawLogic = tombolaJs.includes('function runWeightedDraw()');
  const hasVoucherLogic = tombolaJs.includes('batch.set(vRef, {');

  console.log('\nTombola JS Logic:');
  console.log(`- Search Logic: ${hasSearchLogic}`);
  console.log(`- Weighted Draw Logic: ${hasDrawLogic}`);
  console.log(`- Voucher Creation Logic: ${hasVoucherLogic}`);

  // Rules Verification
  const hasTombolaRules = rules.includes('match /tombola_participants/{docId}');
  const hasWinnerRules = rules.includes('match /tombola_winners/{docId}');
  const hasVoucherRules = rules.includes('match /vouchers/{docId}');

  console.log('\nFirestore Rules:');
  console.log(`- Tombola Participants Rules: ${hasTombolaRules}`);
  console.log(`- Tombola Winners Rules: ${hasWinnerRules}`);
  console.log(`- Vouchers Rules: ${hasVoucherRules}`);

} catch (err) {
  console.error('Verification failed:', err.message);
  process.exit(1);
}
