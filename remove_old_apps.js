var fh = require('fh-fhc');
var dfc = require('fh-dfc');
var winston = require('winston');
var _ = require('underscore');
var async = require('async');

// FHC config:
// var host = 'https://testing.zeta.feedhenry.com/';
// var username = 'testing-admin@example.com';
// var password = 'Password1';
var host = 'https://onprem0.zeta.feedhenry.com';
var username = 'testing-admin@example.com';
var password = 'Password1';

// Dyno config:
var dynofarm = 'https://api.mbaas1.zeta.feedhenry.com';
var dynoUsername = 'df-mbaas1-zeta';
var dynoPassword = 's0nRrtyp';

// Delete apps older than:
var daysBack = 30;

var fhConfig = {
  loglevel: 'error',
  json: true,
  feedhenry: host,
  user: username,
  inmemoryconfig: true
};

var dfcConfig = {
  "dynofarm": dynofarm,
  "username": dynoUsername,
  "_password": dynoPassword,
  "loglevel" : "silly",
  "outfd" : 1,
  "logfd" : 2
};

var dfcModule = dfc(dfcConfig);

var dateTreshold = new Date();
dateTreshold.setDate(dateTreshold.getDate() - daysBack);
dateTreshold = dateTreshold.getTime();

var oldApps = [];
var allApps = [];

fh.load(fhConfig, function(err) {
  if (err) {
    return winston.error(err);
  }

  fh.target({_:[host]}, function(err) {
    if (err) {
      return winston.error(err);
    }

    fh.login({_:[username, password]}, function(err) {
      if (err) {
        return winston.error(err);
      }

      fh.projects({_:['list']}, function(err, projects) {
        if (err) {
          return winston.error(err);
        }

        async.each(projects, function(project, callback) {
          fh.app.list({project: project.guid}, function(err, apps) {
            if (err) {
              winston.error(err);
              return callback(err);
            }

            _.each(apps.apps, function(app) {
              allApps.push(app.guid);
              if (app.sysModified < dateTreshold) {
                oldApps.push(app.guid);
              }
            });
            callback();
          });
        }, function(err) {
          if (err) {
            return;
          }

          dfcModule.dynos([], function(err, dynos) {
            if (err) {
              return winston.error(err);
            }

            _.each(dynos, function(dyno) {
              _.each(dyno.apps, function(app) {
                var appId = app.app.substr(app.app.indexOf('-') + 1);
                appId = appId.substring(0, appId.indexOf('-'));
                if (_.contains(oldApps, appId)) {
                  winston.info('Deleting ' + app.app);
                  dfcModule['delete-app']([dyno.dyno, app.app], function() {
                    if (err) {
                      winston.error('Error deleting app: ' + err);
                    }

                    winston.info('Successfully deleted ' + app.app);
                  });
                }
                if (!_.contains(allApps, appId)) {
                  winston.info('Not found: ' + app.app + ' dyno: ' + dyno.dyno);
                }
              });
            });
          });
        });
      });
    });
  });
});
