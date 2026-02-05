const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

(async () => {
  const db = await open({
    filename: './papers.db',
    driver: sqlite3.Database
  });

  try {
    console.log('マイグレーション開始...');

    // 既存データを取得
    const papers = await db.all('SELECT * FROM papers');
    console.log(`既存データ: ${papers.length}件`);

    // category/subcategory カラムが存在するかチェック
    const tableInfo = await db.all("PRAGMA table_info(papers)");
    const hasCategory = tableInfo.some(col => col.name === 'category');
    const hasSubcategory = tableInfo.some(col => col.name === 'subcategory');
    const hasTags = tableInfo.some(col => col.name === 'tags');

    console.log(`category カラム存在: ${hasCategory}`);
    console.log(`subcategory カラム存在: ${hasSubcategory}`);
    console.log(`tags カラム存在: ${hasTags}`);

    if (!hasCategory && !hasSubcategory) {
      console.log('category/subcategory カラムが見つかりません。スキップします。');
      process.exit(0);
    }

    // tags カラムが無ければ追加
    if (!hasTags) {
      console.log('tags カラムを追加中...');
      await db.exec('ALTER TABLE papers ADD COLUMN tags TEXT');
      console.log('tags カラムを追加しました。');
    }

    // 既存データを tags に変換
    if (hasCategory || hasSubcategory) {
      console.log('既存データを tags に変換中...');
      
      for (const paper of papers) {
        const tagsArray = [];
        
        if (paper.category) {
          tagsArray.push(paper.category);
        }
        if (paper.subcategory) {
          tagsArray.push(paper.subcategory);
        }
        
        const tagsStr = tagsArray.join(',');
        
        await db.run(
          'UPDATE papers SET tags = ? WHERE id = ?',
          [tagsStr || null, paper.id]
        );
        console.log(`ID ${paper.id}: ${tagsStr}`);
      }
      
      console.log('データ変換完了。');
    }

    // category/subcategory カラムを削除（オプション）
    if (hasCategory || hasSubcategory) {
      console.log('category/subcategory カラムを削除中...');
      
      // SQLiteはALTER TABLEでのカラム削除が限定的なため、テーブルを再作成
      await db.exec('BEGIN TRANSACTION');
      
      try {
        // 新しいテーブルを作成（tags カラムのみ）
        await db.exec(`
          CREATE TABLE papers_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            summary TEXT,
            link TEXT,
            pdf_path TEXT,
            tags TEXT,
            importance INTEGER DEFAULT 0,
            create_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 既存データをコピー
        await db.exec(`
          INSERT INTO papers_new (id, title, summary, link, pdf_path, tags, importance, create_at)
          SELECT id, title, summary, link, pdf_path, tags, importance, create_at FROM papers
        `);

        // 旧テーブルを削除
        await db.exec('DROP TABLE papers');

        // 新テーブルを papers にリネーム
        await db.exec('ALTER TABLE papers_new RENAME TO papers');

        await db.exec('COMMIT');
        console.log('category/subcategory カラムを削除し、テーブルを再構成しました。');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    }

    console.log('マイグレーション完了！');
    process.exit(0);
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
})();
