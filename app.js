const express = require("express");
const path = require("path");
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const multer = require("multer");


const app = express();
const PORT = 5001;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let db;
(async () => {
  db = await open({
    filename: './papers.db',
    driver: sqlite3.Database
  });
})();

async function loadPapers(){
  return await db.all('select * from papers order by create_at desc')
}
async function getPaperById(id) {
  return await db.get('SELECT * FROM papers WHERE id = ?', [id]);
}

// ホーム画面（タグ別表示）
app.get("/", async (req, res) => {
  const papers = await loadPapers();
  
  // タグ配列を取得（JSON配列 or コンマ区切り両対応）
  const allTags = papers.flatMap(p => {
    if (!p.tags) return [];
    try {
      // JSON配列の場合
      const parsed = JSON.parse(p.tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // コンマ区切り文字列の場合
      return p.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
  });
  const tags = [...new Set(allTags)];

  // タグごとに最新論文を取得
  const latestByTag = {};
  tags.forEach(tag => {
    const filtered = papers.filter(p => {
      if (!p.tags) return false;
      try {
        const parsed = JSON.parse(p.tags);
        return Array.isArray(parsed) && parsed.includes(tag);
      } catch {
        return p.tags.split(',').map(t => t.trim()).includes(tag);
      }
    });
    if (filtered.length > 0) {
      filtered.sort((a, b) => new Date(b.create_at) - new Date(a.create_at));
      latestByTag[tag] = filtered[0];
    }
  });

  res.render("index", { papers, tags, latestByTag, notFound: false });
});


app.get("/add", async (req, res) => {
  const papers = await loadPapers();
  const allTags = papers.flatMap(p => parseTags(p.tags));
  const tags = [...new Set(allTags)];
  res.render("form", { tags });
});

app.get("/edit/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const paper = await getPaperById(id);
  if (!paper) {
    return res.status(404).send("論文が見つかりません");
  }
  const papers = await loadPapers();
  const allTags = papers.flatMap(p => parseTags(p.tags));
  const tags = [...new Set(allTags)];

  res.render("edit", { id, paper, tags });
});

// タグ検索ページ
app.get("/tag/:tagName", async (req, res) => {
  const papers = await loadPapers();
  const tagName = decodeURIComponent(req.params.tagName);

  const filtered = papers.filter(p => {
    const paperTags = parseTags(p.tags);
    return paperTags.includes(tagName);
  });

  // タグが見つからない場合
  if (filtered.length === 0) {
    const allTags = papers.flatMap(p => parseTags(p.tags));
    const tags = [...new Set(allTags)];
    const latestByTag = {};
    
    tags.forEach(tag => {
      const tagPapers = papers.filter(p => parseTags(p.tags).includes(tag));
      if (tagPapers.length > 0) {
        tagPapers.sort((a, b) => new Date(b.create_at) - new Date(a.create_at));
        latestByTag[tag] = tagPapers[0];
      }
    });
    
    return res.render("index", { 
      papers, 
      tags, 
      latestByTag,
      notFound: true,
      searchedTag: tagName
    });
  }

  res.render("tag", {
    tag: tagName,
    papers: filtered,
    allPapers: papers
  });
});

const uploadDir = path.join(__dirname, "public", "pdfs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + ".pdf";
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("PDFのみアップロード可能です"));
    }
  }
});

// 論文追加処理
app.post("/add", upload.single("pdf"), async (req, res) => {
  const { title, summary, link, tags, newTags } = req.body;

  let tagsArray = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
  if (newTags?.trim()) {
    tagsArray = [...new Set([...tagsArray, ...newTags.split(',').map(t => t.trim()).filter(t => t)])];
  }

  const finalTags = tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;
  const pdfPath = req.file ? req.file.filename : null;

  if (!link && !pdfPath) {
    return res.status(400).send("リンクまたはPDF必須");
  }

  await db.run(
    `INSERT INTO papers 
      (title, summary, link, pdf_path, tags) 
     VALUES (?, ?, ?, ?, ?)`,
    [title, summary, link || null, pdfPath || null, finalTags]
  );

  res.redirect("/");
});

app.post("/edit/:id", upload.single("pdfFile"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, summary, link, tags, newTags } = req.body;
  const pdfFile = req.file;
  const paper = await db.get('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return res.status(404).send("論文が見つかりません");
  }

  let tagsArray = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
  if (newTags?.trim()) {
    tagsArray = [...new Set([...tagsArray, ...newTags.split(',').map(t => t.trim()).filter(t => t)])];
  }

  const finalTags = tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;
  const pdfPath = pdfFile ? pdfFile.filename : paper.pdf_path;

  await db.run(
    `UPDATE papers 
     SET title = ?, summary = ?, link = ?, pdf_path = ?, tags = ? 
     WHERE id = ?`,
    [title, summary, link || null, pdfPath || null, finalTags, id]
  );

  res.redirect("/");
});

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// ------------------ タグ検索API ------------------
app.get("/search/tags", async (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  const papers = await loadPapers();
  const allTags = papers.flatMap(p => parseTags(p.tags));
  const tags = [...new Set(allTags)];
  
  const filteredTags = tags.filter(tag => tag.toLowerCase().includes(query));
  res.json(filteredTags);
});

// ------------------ 重要フラグ切替 ------------------
app.post("/papers/:id/toggle-important", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { important } = req.body;
  await db.run(`UPDATE papers SET importance = ? WHERE id = ?`, [important ? 1 : 0, id]);
  res.json({ success: true });
});

// ------------------ サーバ起動 ------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// ヘルパー関数（行23の後に追加）
function parseTags(tagsData) {
  if (!tagsData) return [];
  try {
    const parsed = JSON.parse(tagsData);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return tagsData.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }
}

/*
paperapp
    |
    |- data
        |- paper.json
    |- views
        |- index.ejs
        ...
    |- public
        |- pdfs
            |- ...
            |- ...
        |- footer.html
        |- header.htmll
        |- style.css
    |- app.js
    |- package-lock.json
    |- package.json

*/