const path = require('path');
const fs = require('fs-extra');
const utils = require('../utils.js');
const dom = require('./dom');
const ydoc = require('../ydoc.js');
const defaultIndexPage = 'index';
const defaultSummaryPage = 'summary.md';
const defaultNavPage = 'nav.md';
const generate = require('../generate.js').generatePage;
const runBatch = require('../generate.js').runBatch;
const parseSummary = require('./summary');
const parseMarkdown = require('./markdown.js');
const parseHtml = require('./html');
const parseNav = require('./nav');

function getBookContent(filepath){
  return parsePage(getIndexContent(filepath));
}

function getIndexContent(filepath){
  let contentFilepath = path.resolve(filepath, defaultIndexPage + '.md');
  let content;
  if(!utils.fileExist(contentFilepath)){    
    contentFilepath = path.resolve(filepath, defaultIndexPage + '.html');
    if(!utils.fileExist(contentFilepath)){
      return null;
    }
    content = parseHtml(contentFilepath);
  }else{
    content = parseMarkdown(contentFilepath);
    fs.unlinkSync(contentFilepath);
  }
  return content;
}

function getSiteContent(filepath){
  return getBookContent(filepath);
}

function getBookSummary(filepath){
  let summaryFilepath = path.resolve(filepath, defaultSummaryPage);
  if(!utils.fileExist(summaryFilepath)) return null;
  let summary = parseMarkdown(summaryFilepath);
  fs.unlinkSync(summaryFilepath);
  return parseSummary(summary);
}

function getNav(filepath){
  let navFilepath = path.resolve(filepath, defaultNavPage);
  if(!utils.fileExist(navFilepath)) return null;
  let content = parseMarkdown(navFilepath);
  fs.unlinkSync(navFilepath);
  return parseNav(content);
}

function getBookContext(book, page){
  const context = utils.extend({}, book);
  context.page = page;
  context.config = ydoc;
  return context;
}

function handleMdPathToHtml(filepath){
  let fileObj = path.parse(filepath);
  if(fileObj.ext === '.md'){
    let name = fileObj.base === defaultIndexPage + '.md' ? 'index.html' : fileObj.name + '.html';
    return path.format({
      dir: fileObj.dir,
      base: name
    })
  }else if(fileObj.ext === '.html'){
    return path.format({
      dir: fileObj.dir,
      base: fileObj.base
    })
  }

  throw new Error(`The file ${filepath} type isn't .md or .html .`)
}

function handleHash(filepath){
  let hashRegexp = /#[\S]*$/;
  let hashStr = filepath.match(hashRegexp);
  if(hashStr)filepath = filepath.replace(hashRegexp, '');
  return {
    filepath: filepath,
    hash: hashStr ? hashStr[0] : ''
  }
}

exports.parseSite =async function(dist){
  try{
    let indexPage = getSiteContent(dist);
    if(!indexPage){
      return utils.log.error(`The documents directory didn't find index.html`)
    }
    
    ydoc.nav = getNav(dist);
    const generateSitePage = generate(dist);
    generateSitePage('./index.html', {
      title: ydoc.title,
      page: {
       content: indexPage.content 
      },
      config: ydoc
    })
    runBatch();
    let rootFiles = fs.readdirSync(dist);
    for(let index in rootFiles){
      let item = rootFiles[index];
      let bookPath = path.resolve(dist, item);
      let stats = fs.statSync(bookPath);      
      if(stats.isDirectory() && item[0] !== '_' && item[0] !== 'style' ){
        await parseBook(bookPath);
      }
    }
  }catch(err){
    utils.log.error(err);
  }
  
}

// const bookSchema = {
//   title: README.md.title,
//   description: README.md.description,
//   page:{  //Current page data
//     title:'',
//     content: ''
//   },
//   summary: null or Object
// }


async function parseBook(bookpath){
  const book = {}; //书籍公共变量

  let page = getBookContent(bookpath);
  if(!page) return ;
  let summary = getBookSummary(bookpath);
  utils.extend(book, {
    title: page.title || ydoc.title,
    description: page.description || ydoc.description,
    summary: summary
  });

  const generatePage = generate(bookpath);
  generatePage('./index.html', getBookContext(book, page))
  if(summary && Array.isArray(summary)) parseDocuments(summary);

  runBatch();

  utils.log.ok(`Generate ${book.title} book "${bookpath}/index.html"`);
  function parseDocuments(summary){
    summary.forEach(item=>{
      if(item.ref) {
        let releativePathObj = handleHash(item.ref);
        let releativePath = releativePathObj.filepath;
        let documentPath = path.resolve(bookpath, releativePath);
        let releativeHtmlPath = handleMdPathToHtml(releativePath);

        if(utils.fileExist(documentPath)){
          let html = parseMarkdown(documentPath);
          let curPage = parsePage(html);
          curPage.title = curPage.title || item.title;
          generatePage(releativeHtmlPath, getBookContext(book, curPage));
          fs.unlinkSync(documentPath);
        }        
        item.ref = releativeHtmlPath + releativePathObj.hash;
      }
      if(item.articles && Array.isArray(item.articles) && item.articles.length > 0){
        parseDocuments(item.articles)
      } 
    })
  }
}

function parsePage(html){
  const $ = dom.parse(html);
  return {
      title: $('h1:first-child').text().trim(),
      description: $('div.paragraph,p').first().text().trim(),
      content: html
  };
}


