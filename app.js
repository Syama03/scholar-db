//https://copilot.microsoft.com/chats/Z6uAvRYMtFmWxbFLnYWYk

const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = 5001;
const DATA_PATH = path.join(__dirname, "data", "papers.json");

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// データ読み込み
function loadPapers() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const raw = fs.readFileSync(DATA_PATH);
  return JSON.parse(raw);
}

// データ保存
function savePapers(papers) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(papers, null, 2));
}

function getPaperById(id) {
  const papers = loadPapers();
  return papers.find((p, index) => index.toString() === id);
}

// ホーム画面（カテゴリ別表示）
app.get("/", (req, res) => {
  const papers = loadPapers();
  const categories = [...new Set(papers.map(p => p.category))];

  // カテゴリごとに最新論文を取得
  const latestByCategory = {};
  categories.forEach(cat => {
    const filtered = papers.filter(p => p.category === cat);
    if (filtered.length > 0) {
      // createdAt がある場合はソートして最新を取得
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      latestByCategory[cat] = filtered[filtered.length -1];
    }
  });

  res.render("index", { papers, categories, latestByCategory });
});


// 論文追加フォーム
app.get("/add", (req, res) => {
  const papers = loadPapers();
  const categories = [...new Set(papers.map(p => p.category))];
  const subcategories = [...new Set(papers.map(p => p.subcategory))];
  res.render("form", { categories, subcategories });
});

app.get("/edit/:id", (req, res) => {
  const papers = loadPapers();
  const index = parseInt(req.params.id);

  if (isNaN(index) || index < 0 || index >= papers.length) {
    return res.status(400).send("無効なIDです");
  }

  const categories = [...new Set(papers.map(p => p.category))];

  // カテゴリ→サブカテゴリ対応表
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

  res.render("edit", { id: index, paper: papers[index], categories, subcategoriesMap });
});

// 大カテゴリごとのページ
app.get("/category/:cat", (req, res) => {
  const papers = loadPapers();
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

// 論文追加処理
app.post("/add", (req, res) => {
  const papers = loadPapers();
  const { title, summary, link, pdfPath, category, newCategory, subcategory, newSubCategory } = req.body;

  const finalCategory = newCategory && newCategory.trim() !== "" ? newCategory : category;
  const finalSubCategory = newSubCategory && newSubCategory.trim() !== "" ? newSubCategory : subcategory;

  if (!link && !pdfPath) {
    return res.status(400).send("リンクまたはPDFファイルのいずれかを入力してください");
  }

  papers.push({
    title,
    summary,
    link: link || null,
    pdfPath: pdfPath || null,
    category: finalCategory,
    subcategory: finalSubCategory || null
  });

  savePapers(papers);
  res.redirect("/");
});

app.post("/edit/:id", (req, res) => {
  const papers = loadPapers();
  const index = parseInt(req.params.id);
  if (isNaN(index) || index < 0 || index >= papers.length) {
    return res.status(400).send("無効なIDです");
  }

  const { title, summary, link, pdfPath, category, newCategory, subcategory, newSubCategory } = req.body;

  if (!link && !pdfPath) {
    return res.status(400).send("リンクまたはPDFパスのいずれかを入力してください");
  }

  const finalCategory = newCategory && newCategory.trim() !== "" ? newCategory : category;
  const finalSubCategory = newSubCategory && newSubCategory.trim() !== "" ? newSubCategory : subcategory;

  papers[index] = { title, summary, link: link || null, pdfPath: pdfPath || null, category: finalCategory, subcategory: finalSubCategory };
  savePapers(papers);
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// サブカテゴリ検索用API
app.get("/subcategories/:category", (req, res) => {
  const papers = loadPapers();
  const category = req.params.category;

  const subs = papers
    .filter(p => p.category === category && p.subcategory)
    .map(p => p.subcategory);

  const uniqueSubs = [...new Set(subs)];

  res.json(uniqueSubs);
});
