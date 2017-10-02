#!/usr/bin/env node

const fs = require('fs');
const program = require('commander');
const path = require('path');
const handlebars = require('handlebars');
const katex = require('katex');
const mime = require('mime');
const bibtexParse = require('bibtex-parser');

// #################################################

const cleanTags = function(tag, str)  {
  str = str.replace('<'+tag+'>','');
  str = str.replace('</'+tag+'>','');
  str = trim(str);
  return str;
};

const trim = function(string) {
  // Make sure we trim BOM and NBSP
  const rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  string = string.replace(rtrim, '');
  return string;
};

const replaceAll = function(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
};

const HTMLEntities = function(str) {
  str = replaceAll(str, "&", "&amp;");
  str = replaceAll(str, "''", "&rdquo;");
  str = replaceAll(str, "``", "&ldquo;");
  str = replaceAll(str, "'", "&rsquo;");
  str = replaceAll(str, "`", "&lsquo;");
  return str;
};

const base64FileData = function(f) {
  const fData = fs.readFileSync(f, {encoding: 'base64'});
  const fMime = mime.getType(f);
  // console.log(f, fMime);
  const fBase64 = 'data:' + fMime + ';base64,' + fData;
  return fBase64;
};

// #################################################

const processTitle = function(xml) {
  // console.log(xml);
  let title = xml.match(/<title>([\s\S]*?)<\/title>/g);
  if ( title ) {
    title = cleanTags('title', title[0]);
    title = title.trim();
    title = HTMLEntities(title);
  } else {
    title = 'Warning: No Title Found';
  }
  return title;
};

const processPublication = function(xml) {
  // console.log(xml);
  let publication = xml.match(/<publication>([\s\S]*?)<\/publication>/g);
  if ( publication ) {
    publication = cleanTags('publication', publication[0]);
    publication = publication.trim();
    publication = HTMLEntities(publication);
  } else {
    publication = 'Warning: No Publication Found';
  }
  return publication;
};

const processAuthors = function(xml) {
  let matches = xml.match(/<author>([\s\S]*?)<\/author>/gmi);
  let authors = [];
  if (matches) {
    for ( let i = 0; i < matches.length; i++ ) {
      let str = matches[i];
      let author = {
        name : '',
        affil : ''
      };
      let name = str.match(/<name>([\s\S]*?)<\/name>/mi);
      if (name) {
        author.name = name[1];
      }
      let affil = str.match(/<affil>([\s\S]*?)<\/affil>/mi);
      if (affil) {
        author.affil = affil[1];
      }
      authors.push(author);
    }
  }
  return authors;
};

const processAbstract = function(xml) {
  let abstract = xml.match(/<abstract>([\s\S]*?)<\/abstract>/gmi);
  let abstractHTMLString = '';
  if (abstract) {
    abstract = cleanTags('abstract', abstract[0]);
    abstract = replaceAll(abstract, '\r', '');
    let lines = abstract.split('\n');

    for (let i = 0; i < lines.length; i++) {
      var line = lines[i];

      // if line is not empty and the line starts with a alphanumeric character
      if ( line && /^[a-z0-9]+$/i.test(line[0]) ) {
        abstractHTMLString += '<p>'+line+'</p>';
      } else {
        abstractHTMLString += line;
      }
    }

  }
  abstractHTMLString = HTMLEntities(abstractHTMLString);
  return abstractHTMLString;
};

const processKeywords = function(xml) {
  let matches = xml.match(/<keyword>([\s\S]*?)<\/keyword>/gmi);
  let keywords = [];
  if (matches) {
    for (let i = 0; i < matches.length; i++) {
      keywords.push(cleanTags('keyword', matches[i]));
    }
  }
  // console.log(keywords);
  return keywords;
};

const processHeadings = function(xml) {
  let headings = xml.match(/(<h1>|<h2>|<h3>)([\s\S]*?)(<\/h1>|<\/h2>|<\/h3>)/gm);
  let h1Increment = 0;
  let h2Increment = 0;
  let h3Increment = 0;
  if ( !headings ) {
    return xml;
  }
  for ( let i = 0; i < headings.length; i++ ) {
    let heading = headings[i];
    let newHeading = '';
    if ( heading.indexOf('<h1>') === 0 ) {
      h1Increment++;
      h2Increment = 0;
      h3Increment = 0;
      newHeading += '<h1>';
      newHeading += h1Increment+'. ';
      newHeading += cleanTags('h1', heading);
      newHeading += '</h1>';
    }
    if ( heading.indexOf('<h2>') === 0 ) {
      h2Increment++;
      h3Increment = 0;
      newHeading += '<h2>';
      newHeading += h1Increment+'.'+h2Increment+'. ';
      newHeading += cleanTags('h2', heading);
      newHeading += '</h2>';
    }
    if ( heading.indexOf('<h3>') === 0 ) {
      h3Increment++;
      newHeading += '<h3>';
      newHeading += h1Increment+'.'+h2Increment+'.'+h3Increment+'. ';
      newHeading += cleanTags('h3', heading);
      newHeading += '</h3>';
    }
    xml = xml.replace(heading, newHeading);
  }
  return xml;
};

const processTables = function(xml) {
  let tables = xml.match(/(<table>)([\s\S]*?)(<\/table>)/gm);
  // if tables returns emtpy do not continue
  if (!tables) {
    return xml;
  }
  for ( let i = 0; i < tables.length; i++ ) {
    let table = tables[i];
    // console.log(table);
    // Sorting out the table caption
    let caption = tables[i].match(/<caption>([\s\S]*?)<\/caption>/m);
    // console.log(caption);
    if ( caption !== null ) {
      let captionText = cleanTags('caption', caption[0]);
      let newCaption = '<caption>Table '+(i+1)+': '+captionText+'</caption>';
      table = table.replace(caption[0], newCaption);
    }

    // Sorting out the label and replacing the table in the content
    let label = tables[i].match(/<label>([\s\S]*?)<\/label>/m);
    //console.log(label);
    if ( label !== null ) {
      table = table.replace(label[0], '');
      xml = xml.replace(tables[i], table);

      label = cleanTags('label', label[0]);
      label = trim(label);
      // Table cross-referencing
      xml = replaceAll(xml, '>'+label+'<', '>'+(i+1)+'<');
    } else {
      xml = xml.replace(tables[i], table);
    }

  }
  return xml;
};

const processInlineEquations = function(xml) {
  // gets maths within equ
  let tokens = xml.match(/<equ>(.*?)<\/equ>/gmi);
  // console.log(tokens);
  if (tokens) {
    for (let i = 0; i < tokens.length; i++) {
      let maths = cleanTags('equ', tokens[i]);
      // console.log(maths);
      maths = katex.renderToString(maths);
      // console.log(maths);
      xml = xml.replace(tokens[i], maths);
    }
  }
  return xml;
};

const processEquations = function(xml) {
  let tokens = xml.match(/<equation>([\s\S]*?)<\/equation>/g);

  if (tokens != null) {
    for (let i = 0; i < tokens.length; i++) {
      let maths = cleanTags('equation', tokens[i]);
      var label = maths.match(/<label>([\s\S]*?)<\/label>/m);
      if (label != null) {
        maths = maths.replace(label[0], '');
      }
      maths = katex.renderToString(maths, { displayMode: true });
      maths = replaceAll(maths,'\n','');
      xml = xml.replace(tokens[i], '<div class="paper-equation">'+maths+'</div><p class="paper-equation-caption">('+(i+1)+')</p>');
      if (label != null) {
        xml = replaceAll(xml, label[1], (i+1));
      }
    }
  }
  return xml;
};

const processFigures = function(xml, folder) {
  let figures = xml.match(/(<figure>)([\s\S]*?)(<\/figure>)/gm);
  // if tables returns emtpy do not continue
  if (!figures) {
    return xml;
  }
  let n = 0;
  for (let figXML of figures) {
    n++;
    let figReplacementXML = '<figure>';

    let figFile = figXML.match(/<file>([\s\S]*?)<\/file>/m);
    if (figFile) {
      figFile = figFile[1];
      figFile = figFile.trim();
      figFile = folder+'/'+figFile;
      // console.log(figFile);
      if (fs.existsSync(figFile)) {
        let figData = base64FileData(figFile);
        figReplacementXML += '<img class="paper-img" src="'+figData+'" />';
      }
    }

    let figCaption = figXML.match(/<caption>([\s\S]*?)<\/caption>/m);
    if (figCaption != null) {
      figCaption = figCaption[1];
      figCaption = figCaption.trim();
    } else {
      figCaption = 'No Caption Detected';
    }
    figReplacementXML += '<figcaption>Figure '+(n)+': '+figCaption+'</figcaption>';
    figReplacementXML += '</figure>';

    xml = xml.replace(figXML, figReplacementXML);

    let label = figXML.match(/<label>([\s\S]*?)<\/label>/m);
    if (label) {
      label = label[1];
      label = label.trim();
      xml = replaceAll(xml, label, n);
    }

  }
  return xml;
};

const processAudio = function(xml, folder) {

  let audio = xml.match(/(<audio>)([\s\S]*?)(<\/audio>)/gm);

  if (!audio) {
    return xml;
  }

  let n = 0;
  for (let audioXML of audio) {
    n++;
    let audioReplacementXML = '';

    let audioSrc = audioXML.match(/<src>([\s\S]*?)<\/src>/m);
    if (audioSrc) {
      audioSrc = audioSrc[1];
      audioSrc = audioSrc.trim();
      audioSrc = folder+'/'+audioSrc;
      console.log(audioSrc);
      if (fs.existsSync(audioSrc)) {
        let audData = base64FileData(audioSrc);
        audioReplacementXML += '<div class="media-div"><audio controls><source src="'+audData+'"></audio></div>';
      } else {
        audioReplacementXML += '<p class="paper-alert"><b>Warning:</b> Audio file could not be found</p>';
      }
    } else {
      audioReplacementXML += '<p class="paper-alert"><b>Warning:</b> Audio src tag could not be found</p>';
    }

    // Sorting out the audio caption
    let caption = audioXML.match(/<caption>([\s\S]*?)<\/caption>/m);
    if (caption) {
      caption = caption[1];
      caption = caption.trim();
      audioReplacementXML += '<p class="paper-media-caption">Audio '+(n)+': '+caption+'</p>';
    }

    xml = xml.replace(audioXML, audioReplacementXML);

    // Replacing all the references to the label with the number
    var label = audioXML.match(/<label>([\s\S]*?)<\/label>/m);
    if (label != null) {
      label = label[1];
      label = label.trim();
      xml = replaceAll(xml, label, n);
    }
  } // end for (let audioXML of audio)
  return xml;
};

const processData = function(xml, folder) {

  let dataTags = xml.match(/<data>[\s\S]*?<\/data>/gm);

  if (!dataTags) {
    return xml;
  }

  let n = 0;
  for (let dataXML of dataTags) {
    n++;
    let dataReplacementXML = '';

    let dataSrc = dataXML.match(/<src>([\s\S]*?)<\/src>/m);
    if (dataSrc) {
      dataSrc = dataSrc[1];
      dataSrc = dataSrc.trim();
      dataSrc = folder+'/'+dataSrc;
      if (fs.existsSync(dataSrc)) {
        let dataData = base64FileData(dataSrc);
        dataReplacementXML += '<p class="paper-data"><a href="'+dataData+'" target="_blank" >Open Data File</a></p>';
      } else {
        dataReplacementXML += '<p class="paper-alert"><b>Warning:</b> Data file could not be found</p>';
      }
    } else {
      dataReplacementXML += '<p class="paper-alert"><b>Warning:</b> Data src could not be found</p>';
    }

    // Captions
    var caption = dataXML.match(/<caption>([\s\S]*?)<\/caption>/m);
    if (caption != null) {
      caption = caption[1];
      caption = caption.trim();
      dataReplacementXML += '<p class="paper-media-caption">Data '+(n)+': '+caption+'</p>';
    }

    xml = xml.replace(dataXML, dataReplacementXML);

    // Sorting out the label
    let label = dataXML.match(/<label>([\s\S]*?)<\/label>/m);
    if (label != null) {
      label = label[1];
      label = label.trim();
      xml = replaceAll(xml, label, n);
    }

  } // end for (let dataXML of dataTags)

  return xml;
};

const processVideo = function(xml, folder) {

  let videoTags = xml.match(/<video>[\s\S]*?<\/video>/gm);

  if (!videoTags) {
    return xml;
  }

  let n = 0;
  for (let vidXML of videoTags) {
    n++;

    let vidReplacementXML = '';
    let vidSrc = vidXML.match(/<src>([\s\S]*?)<\/src>/m);

    if (vidSrc) {
      vidSrc = vidSrc[1];
      vidSrc = vidSrc.trim();
      vidSrc = folder+'/'+vidSrc;
      if (fs.existsSync(vidSrc)) {
        let vidData = base64FileData(vidSrc);
        vidReplacementXML += '<div class="media-div"><video controls><source src="'+vidData+'"></video></div>';
      } else {
        vidReplacementXML += '<p class="paper-alert"><b>Warning:</b> Could not find video in your files list</p>';
      }
    } else {
      vidReplacementXML += '<p class="paper-alert"><b>Warning:</b> Could not find src tag</p>';
    }

    // Captions
    var caption = vidXML.match(/<caption>([\s\S]*?)<\/caption>/m);
    if (caption != null) {
      caption = caption[1];
      caption = caption.trim();
      vidReplacementXML += '<p class="paper-media-caption">Video '+(n)+': '+caption+'</p>';
    }

    xml = xml.replace(vidXML, vidReplacementXML);

    // Sorting out the label referencing
    let label = vidXML.match(/<label>([\s\S]*?)<\/label>/m);
    if (label != null) {
      label = label[1];
      label = label.trim();
      xml = replaceAll(xml, label, n);
    }

  } // for (let videoXML of videoTags)

  return xml;
};


const processContent = function(xml, folder, citations) {
  let content = xml.match(/<content>([\s\S]*?)<\/content>/gmi);
  if (content) {
    content = cleanTags('content', content[0]);
    content = HTMLEntities(content);
    content = processTables(content);
    content = processHeadings(content);
    content = processInlineEquations(content);
    content = processEquations(content);

    content = processFigures(content, folder);
    content = processAudio(content, folder);
    content = processData(content, folder);
    content = processVideo(content, folder);

    content = replaceAll(content, '<ref>', '');
    content = replaceAll(content, '</ref>', '');
    content = replaceAll(content, '<cite>', '<sup>[');
    content = replaceAll(content, '</cite>', ']</sup>');


    // replace citation idxs
    if ( citations ) {
      let n = 0;
      for (let key in citations) {
        n++;
        // add hyperlink if url exists
        if (citations[key].URL) {
          // upper case
          content = replaceAll(content, key, '<a href="'+citations[key].URL+'">'+n+'</a>');
          // lower case
          content = replaceAll(content, key.toLowerCase(), '<a href="'+citations[key].URL+'">'+n+'</a>');
        } else {
          content = replaceAll(content, key, n);
          content = replaceAll(content, key.toLowerCase(), n);
        }
      }
    }

    // sorting out the paragraphs
    content = replaceAll(content, '\r', '');
    let lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      let line = lines[i];
      if ( line && /^[a-z0-9]+$/i.test(line[0]) ) { // if line is not empty and the line starts with a alphanumeric character,
        content = content.replace(lines[i], '<p>'+line+'</p>');
      }
    }


  } else {
    content = 'Warning: No Content Detected';
  }
  return content;
};

// #################################################

const compileDocument = function(file, folder) {
  // Read the document
  const xml = fs.readFileSync(file, 'utf8');

  // Retrieve the title
  const title = processTitle(xml);
  const publication = processPublication(xml);
  const authors = processAuthors(xml);
  const abstract = processAbstract(xml);
  const keywords = processKeywords(xml);

  let citationFile = xml.match(/<citations>([\s\S]*?)<\/citations>/g);
  let citations = {};
  if ( citationFile ) {
    citationFile = cleanTags('citations', citationFile[0]);
    citationFile = citationFile.trim();
    citationFile = folder+'/'+citationFile;
    if (fs.existsSync(citationFile)) {
      citations = fs.readFileSync(citationFile, 'utf8');
      citations = bibtexParse(citations);
    }
  }

  const content = processContent(xml, folder, citations);

  // Load the template
  const paperTemplate = handlebars.compile(fs.readFileSync('paper.hbs', 'utf8'));
  const css = fs.readFileSync('paper.css', 'utf8');
  // Insert in the papers
  const paperHTML = paperTemplate({
    'title' : title,
    'publication' : publication,
    'authors' : authors,
    'abstract' : abstract,
    'keywords' : keywords,
    'content' : content,
    'style': css,
    'citations': citations
  });
  // Write the output file
  fs.writeFileSync(folder + '/index.html', paperHTML);
};


// Run-time
program
  .arguments('<file>')
  .action(function(file) {

    // Resolve the full file path
    file = path.resolve(file);
    // Resolve the folder path
    const folder = path.dirname(file);
    console.log('Compiling %s', file);
    compileDocument(file, folder);

  })
  .parse(process.argv);
