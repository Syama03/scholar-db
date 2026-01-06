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

// ホーム画面（カテゴリ別表示）
app.get("/", async (req, res) => {
  const papers = await loadPapers();
  const categories = [...new Set(papers.map(p => p.category))];

  // カテゴリごとに最新論文を取得
  const latestByCategory = {};
  categories.forEach(cat => {
    const filtered = papers.filter(p => p.category === cat);
    if (filtered.length > 0) {
      // createdAt がある場合はソートして最新を取得
      filtered.sort((a, b) => new Date(b.creat_at) - new Date(a.create_at));
      latestByCategory[cat] = filtered[0];
    }
  });

  res.render("index", { papers, categories, latestByCategory });
});


// 論文追加フォーム
app.get("/add", async (req, res) => {
  const papers = await loadPapers();
  const categories = [...new Set(papers.map(p => p.category))];
  const subcategories = [...new Set(papers.map(p => p.subcategory))];
  res.render("form", { categories, subcategories });
});

app.get("/edit/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const paper = await getPaperById(id);
  if (!paper) {
    return res.status(404).send("論文が見つかりません");
  }
  const papers = await loadPapers();
  const categories = [...new Set(papers.map(p => p.category))];

  const subcategoriesMap = {};
  papers.forEach(p => {
    if (!subcategoriesMap[p.category]) {
      subcategoriesMap[p.category] = new Set();
    }
    if (p.subcategory) {
      subcategoriesMap[p.category].add(p.subcategory);
    }
  });
  for (const cat in subcategoriesMap) {
    subcategoriesMap[cat] = Array.from(subcategoriesMap[cat]);
  }

  res.render("edit", { id, paper, categories, subcategoriesMap });
});

// 大カテゴリごとのページ
app.get("/category/:cat", async (req, res) => {
  const papers = await loadPapers();
  const cat = req.params.cat;

  const filtered = papers.filter(p => p.category === cat);

  const grouped = {};
  filtered.forEach(p => {
    const sub = p.subcategory || "未分類";
    if (!grouped[sub]) grouped[sub] = [];
    grouped[sub].push(p);
  });

  res.render("category", {
    category: cat,
    grouped, 
    papers
  });
});

const uploadDir = path.join(__dirname, "public");

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
app.post("/add",upload.single("pdf"), async (req, res) => {
  const { title, summary, link, category, newCategory, subcategory, newSubCategory } = req.body;

  const finalCategory = newCategory?.trim() || category;
  const finalSubCategory = newSubCategory?.trim() || subcategory;
  const pdfPath = req.file ? `${req.file.filename}` : null;

  if (!link && !pdfPath) {
    return res.status(400).send("リンクまたはPDF必須");
  }

  await db.run(
    `INSERT INTO papers 
      (title, summary, link, pdf_path, category, subcategory) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, summary, link || null, pdfPath || null, finalCategory, finalSubCategory || null]
  );

  res.redirect("/");
});

app.post("/edit/:id", upload.single("pdfFile"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, summary, link, category, newCategory, subcategory, newSubCategory } = req.body;
  const pdfFile = req.file;
  const paper = await db.get('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return res.status(404).send("論文が見つかりません");
  }
  const finalCategory = newCategory?.trim() || category;
  const finalSubCategory = newSubCategory?.trim() || subcategory;
  const pdfPath = pdfFile ? pdfFile.filename : paper.pdf_path;

  await db.run(
    `UPDATE papers 
     SET title = ?, summary = ?, link = ?, pdf_path = ?, category = ?, subcategory = ? 
     WHERE id = ?`,
    [title, summary, link || null, pdfPath || null, finalCategory, finalSubCategory || null, id]
  );

  res.redirect("/");
});

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// ------------------ サブカテゴリ検索API ------------------
app.get("/subcategories/:category", async (req, res) => {
  const category = req.params.category;
  const subs = await db.all(
    `SELECT DISTINCT subcategory FROM papers WHERE category = ? AND subcategory IS NOT NULL`,
    [category]
  );
  res.json(subs.map(s => s.subcategory));
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