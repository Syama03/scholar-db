const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

(async () => {
  const db = await open({
    filename: './papers.db',
    driver: sqlite3.Database
  });

  try {
    console.log('タグ形式の変換開始...');

    const papers = await db.all('SELECT id, tags FROM papers WHERE tags IS NOT NULL');
    console.log(`対象データ: ${papers.length}件\n`);

    let convertCount = 0;
    let alreadyJsonCount = 0;

    for (const paper of papers) {
      try {
        // 既にJSON配列形式かチェック
        const parsed = JSON.parse(paper.tags);
        if (Array.isArray(parsed)) {
          alreadyJsonCount++;
        }
      } catch {
        // コンマ区切り形式と判定し、JSON配列に変換
        const tagsArray = paper.tags
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0);
        
        const tagsJson = JSON.stringify(tagsArray);
        
        await db.run(
          'UPDATE papers SET tags = ? WHERE id = ?',
          [tagsJson, paper.id]
        );
        
        console.log(`ID ${paper.id}: ${paper.tags} → ${tagsJson}`);
        convertCount++;
      }
    }

    console.log(`\n変換完了: ${convertCount}件`);
    console.log(`既にJSON形式: ${alreadyJsonCount}件`);
    process.exit(0);
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
})();