#!/usr/bin/env node
/**
 * RSS Feed Generator for YouTube Video Notes
 * Scans markdown files from youtube-to-epub output and generates RSS feed
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt();

// Configuration
const CONFIG = {
  sourceDir: '/Users/trungluong/clawd/output',
  outputDir: './public',
  articlesDir: './public/articles',
  feedTitle: 'The Indie App - YouTube Notes',
  feedDescription: 'Curated notes and insights from YouTube videos',
  siteUrl: 'https://myfeed.theindie.app',
  feedUrl: 'https://myfeed.theindie.app/feed.xml',
  author: 'Stv',
  maxItems: 50, // Max items in RSS feed
};

// Ensure output directories exist
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}
if (!fs.existsSync(CONFIG.articlesDir)) {
  fs.mkdirSync(CONFIG.articlesDir, { recursive: true });
}

/**
 * Get all markdown files from source directory
 */
function getMarkdownFiles() {
  if (!fs.existsSync(CONFIG.sourceDir)) {
    console.warn(`Source directory not found: ${CONFIG.sourceDir}`);
    return [];
  }

  return fs.readdirSync(CONFIG.sourceDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(CONFIG.sourceDir, file));
}

/**
 * Parse markdown file and extract metadata
 */
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: markdownContent } = matter(content);

  const stats = fs.statSync(filePath);
  const filename = path.basename(filePath, '.md');
  
  // Extract title (from frontmatter or first H1)
  let title = data.title || filename;
  const h1Match = markdownContent.match(/^#\s+(.+)$/m);
  if (!title && h1Match) {
    title = h1Match[1];
  }

  // Generate excerpt (first 200 chars of content, no markdown)
  const plainText = markdownContent
    .replace(/^#.+$/gm, '') // Remove headers
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links but keep text
    .replace(/[*_`]/g, '') // Remove formatting
    .trim();
  const excerpt = plainText.substring(0, 200) + '...';

  return {
    filename,
    title,
    content: markdownContent,
    html: md.render(markdownContent),
    excerpt,
    pubDate: data.date || stats.mtime,
    url: data.url || '', // Original YouTube URL if available
    tags: data.tags || [],
  };
}

/**
 * Generate HTML article page
 */
function generateArticlePage(article) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(article.title)} - The Indie App</title>
  <link rel="stylesheet" href="../style.css">
  <meta name="description" content="${escapeHtml(article.excerpt)}">
</head>
<body>
  <header>
    <nav>
      <a href="../index.html">← Back to Feed</a>
      ${article.url ? `<a href="${escapeHtml(article.url)}" target="_blank">🎥 Watch on YouTube</a>` : ''}
    </nav>
  </header>
  <main>
    <article>
      <h1>${escapeHtml(article.title)}</h1>
      <time datetime="${new Date(article.pubDate).toISOString()}">
        ${new Date(article.pubDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}
      </time>
      ${article.html}
    </article>
  </main>
  <footer>
    <p>Generated from YouTube video notes</p>
  </footer>
</body>
</html>`;

  const filename = `${article.filename}.html`;
  fs.writeFileSync(path.join(CONFIG.articlesDir, filename), html);
  return filename;
}

/**
 * Generate RSS feed XML
 */
function generateRSSFeed(articles) {
  const items = articles
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, CONFIG.maxItems)
    .map(article => {
      const articleUrl = `${CONFIG.siteUrl}/articles/${article.filename}.html`;
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${articleUrl}</link>
      <guid>${articleUrl}</guid>
      <pubDate>${new Date(article.pubDate).toUTCString()}</pubDate>
      <description><![CDATA[${article.excerpt}]]></description>
      <content:encoded><![CDATA[${article.html}]]></content:encoded>
      ${article.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('\n      ')}
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(CONFIG.feedTitle)}</title>
    <link>${CONFIG.siteUrl}</link>
    <description>${escapeXml(CONFIG.feedDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${CONFIG.feedUrl}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'feed.xml'), rss);
}

/**
 * Generate index.html landing page
 */
function generateIndexPage(articles) {
  const articleList = articles
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .map(article => `
      <li>
        <a href="./articles/${article.filename}.html">
          <h3>${escapeHtml(article.title)}</h3>
          <time datetime="${new Date(article.pubDate).toISOString()}">
            ${new Date(article.pubDate).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </time>
          <p>${escapeHtml(article.excerpt)}</p>
        </a>
      </li>
    `)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.feedTitle}</title>
  <link rel="stylesheet" href="./style.css">
  <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="${CONFIG.feedUrl}" />
  <meta name="description" content="${CONFIG.feedDescription}">
</head>
<body>
  <header>
    <h1>📚 The Indie App</h1>
    <p>${CONFIG.feedDescription}</p>
    <a href="${CONFIG.feedUrl}" class="rss-link">📡 Subscribe via RSS</a>
  </header>
  <main>
    <ul class="article-list">
      ${articleList}
    </ul>
  </main>
  <footer>
    <p>Generated from YouTube video notes · Last updated: ${new Date().toLocaleDateString()}</p>
  </footer>
</body>
</html>`;

  fs.writeFileSync(path.join(CONFIG.outputDir, 'index.html'), html);
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Utility: Escape XML
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Generating RSS feed...\n');

  const files = getMarkdownFiles();
  console.log(`Found ${files.length} markdown files in ${CONFIG.sourceDir}`);

  if (files.length === 0) {
    console.warn('No markdown files found. Creating sample feed.');
    // Create sample article for testing
    const sampleArticle = {
      filename: 'sample',
      title: 'Welcome to The Indie App',
      content: '# Welcome\n\nThis is a sample article. Add markdown files to `/Users/trungluong/clawd/output/` to populate the feed.',
      html: '<h1>Welcome</h1><p>This is a sample article. Add markdown files to <code>/Users/trungluong/clawd/output/</code> to populate the feed.</p>',
      excerpt: 'This is a sample article. Add markdown files to populate the feed.',
      pubDate: new Date(),
      url: '',
      tags: ['sample'],
    };
    generateArticlePage(sampleArticle);
    generateRSSFeed([sampleArticle]);
    generateIndexPage([sampleArticle]);
  } else {
    const articles = files.map(parseMarkdownFile);
    
    console.log('\n📝 Generating article pages...');
    articles.forEach(article => {
      const filename = generateArticlePage(article);
      console.log(`  ✓ ${filename}`);
    });

    console.log('\n📡 Generating RSS feed...');
    generateRSSFeed(articles);
    console.log(`  ✓ feed.xml (${articles.length} items)`);

    console.log('\n🏠 Generating index page...');
    generateIndexPage(articles);
    console.log('  ✓ index.html');
  }

  console.log(`\n✅ Done! Output: ${CONFIG.outputDir}/`);
  console.log(`   Feed URL: ${CONFIG.feedUrl}`);
  console.log(`   Site URL: ${CONFIG.siteUrl}\n`);
}

main();
