const path = require('path')
const express = require('express')
const cors = require('cors')
const nunjucks = require('nunjucks')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const flash = require('connect-flash')
const i18n = require("i18n")
const moment = require('moment')

const config = require('./config')
const dmsRoutes = require('./routes/dms')
const userRoutes = require('./routes/user')
const {loadTheme, loadPlugins, processMarkdown} = require('./utils')

module.exports.makeApp = function () {
  const app = express()
  app.set('config', config)
  app.set('dms', require('./lib/dms'))
  app.set('utils', require('./utils/index'))
  app.set('port', config.get('app:port'))
  if (config.get('env') === 'development') {
    const mocks = require('./fixtures')
    mocks.initMocks()
    console.warn('You are activated the mocks.')
  }
  // Explicitely set views location - this is needed for Zeit to work
  app.set('views', path.join(__dirname, '/views'))

  // i18n
  const translationsDir = config.get('TRANSLATIONS') || '/i18n'
  i18n.configure({
    cookie: 'defaultLocale',
    directory: __dirname + translationsDir
  })

  // Middlewares
  // Theme comes first so it overrides
  const themeDir = config.get('THEME_DIR')
  const themeName = config.get('THEME')
  if (themeName) {
    app.use('/static', express.static(path.join(__dirname, `/${themeDir}/${themeName}/public`)))
  }
  // Default assets
  app.use('/static', express.static(path.join(__dirname, '/public')))

  app.use(
    bodyParser.urlencoded({
      extended: true
    })
  )
  app.use(cors())
  app.use(cookieParser())
  app.use(i18n.init)
  app.use(session({
    secret: config.get('SESSION_SECRET'),
    cookie: {
      maxAge: config.get("SESSION_COOKIE_MAX_AGE")
    }
  }))
  
  // enable flash messages
  app.use(flash())
  app.use((req, res, next) => {
    res.locals.message = req.flash('info')
    next()
  })
  
  loadPlugins(app)
  loadTheme(app)

  // Redirect x/y/ to x/y
  app.use((req, res, next) => {
    if(req.url.substr(-1) === '/' && req.url.length > 1) {
      res.redirect(301, req.url.slice(0, req.url.length-1))
    }
    else {
      next()
    }
  })

  // Users
  userRoutes(app)

  // Controllers
  app.use([
    dmsRoutes()
  ])

  app.use((err, req, res, next) => {
    if (err.status >= 400 && err.status < 500) {
      res.status(err.status).render('404.html', {
        message: err.statusText,
        status: err.status
      })
      return
    } else {
      console.error(err)
      res.status(500).send('Something failed. Please, try again later.')
    }
  })

  // look for views template folder and in plugins folders
  const views = [path.join(__dirname, `/plugins`), app.get('views')]

  // also look for view templates in enabled theme directory
  if (themeName) {
    views.unshift(path.join(__dirname, `/${themeDir}/${themeName}/views`))
  }

  const env = nunjucks.configure(views, {
    autoescape: true,
    express: app
  })

  env.addFilter('formatDate', (date) => {
    try {
      return moment(date).format('YYYY[-]MM[-]DD')
    } catch (e) {
      console.warn('Failed to format date', e)
      return date || '--'
    }
  })
  
  env.addFilter('formatDateFromNow', (date) => {
    try {
      return moment(date).fromNow()
    } catch (e) {
      console.warn('Failed to format date', e)
      return date || '--'
    }
  })

  env.addFilter('processMarkdown', (str) => {
    try {
      return processMarkdown.render(str)
    } catch (e) {
      console.warn('Failed to format markdown', e)
      return str
    }
  })
  
  return app
}

module.exports.start = function () {
  return new Promise((resolve, reject) => {
    const app = module.exports.makeApp()

    let server = app.listen(app.get('port'), () => {
      console.log('Listening on :' + app.get('port'))
      resolve(server)
    })
    app.shutdown = function () {
      server.close()
      server = null
    }
  })
}

if (process.env.NODE_ENV !== 'test') {
  module.exports.start()
}
