const Metalsmith  = require('metalsmith');
const collections = require('metalsmith-collections');
const layouts     = require('metalsmith-layouts');
const markdown    = require('metalsmith-markdown');
const permalinks  = require('metalsmith-permalinks');
const discoverPartials = require('metalsmith-discover-partials');

Metalsmith(__dirname)
  .metadata({
    sitename: 'Publish',
    siteurl: 'https://jamesgopsill.github.io/WebPub/',
    description: 'Enhancing Research Papers',
    generatorName: 'Metalsmith',
    generatorUrl: 'http://www.metalsmith.io'
  })
  .source('./docs-src')
  .destination('./docs')
  .clean(true)
  .use(collections({
    posts: 'posts/*/*.md'
  }))
  .use(markdown())
  .use(permalinks({
    relative: false
  }))
  .use(discoverPartials({
    directory: './docs-layouts/partials',
    pattern: /\.hbs$/
  }))
  .use(layouts({
    engine: 'handlebars',
    directory: './docs-layouts'
  }))
  .build(function(err){
    if (err) throw err;
  });
