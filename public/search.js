// タグ検索機能の初期化
function initTagSearch() {
  const searchInput = document.getElementById('headerTagSearch');
  const searchBtn = document.getElementById('headerTagSearchBtn');
  const suggestions = document.getElementById('tagSuggestions');
  
  console.log('initTagSearch called');
  console.log('searchInput:', searchInput);
  console.log('searchBtn:', searchBtn);
  
  if (!searchInput || !searchBtn) {
    console.warn('Tag search elements not found');
    return;
  }
  
  console.log('Adding event listeners...');
  
  searchBtn.addEventListener('click', (e) => {
    console.log('Search button clicked');
    e.preventDefault();
    const query = searchInput.value.trim();
    console.log('Query:', query);
    if (query) {
      console.log('Redirecting to:', `/tag/${encodeURIComponent(query)}`);
      window.location.href = `/tag/${encodeURIComponent(query)}`;
    }
  });
  
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBtn.click();
    }
  });
  
  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if (!query) {
      suggestions.style.display = 'none';
      return;
    }
    
    try {
      const response = await fetch(`/search/tags?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      const tags = await response.json();
      
      suggestions.innerHTML = '';
      
      if (tags.length === 0) {
        suggestions.style.display = 'none';
        return;
      }
      
      tags.forEach(tag => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #eee; color: #333;';
        div.textContent = tag;
        div.addEventListener('click', () => {
          window.location.href = `/tag/${encodeURIComponent(tag)}`;
        });
        div.addEventListener('mouseover', () => {
          div.style.backgroundColor = '#f0f0f0';
        });
        div.addEventListener('mouseout', () => {
          div.style.backgroundColor = '';
        });
        suggestions.appendChild(div);
      });
      
      suggestions.style.display = 'block';
    } catch (err) {
      console.error('タグ検索エラー:', err);
    }
  });
  
  // ドキュメント外クリックでサジェスト非表示
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tagSearchContainer')) {
      suggestions.style.display = 'none';
    }
  });
}

// DOM読み込み完了時に初期化
console.log('search.js loaded, document.readyState:', document.readyState);

function waitForElements() {
  const searchInput = document.getElementById('headerTagSearch');
  const searchBtn = document.getElementById('headerTagSearchBtn');
  
  if (searchInput && searchBtn) {
    console.log('Elements found, initializing');
    initTagSearch();
  } else {
    console.log('Elements not found yet, retrying...');
    setTimeout(waitForElements, 200);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');
    setTimeout(waitForElements, 200);
  });
} else {
  console.log('DOM already loaded, waiting for elements');
  setTimeout(waitForElements, 200);
}
