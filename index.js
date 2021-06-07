const express = require('express');
const util = require('util');
const app = express();
const fs = require('fs');
const morgan = require('morgan');
const apn = require('apn');
const { notEqual } = require('node:assert');
require('dotenv').config(); 

// express setup
const port = 4000;
app.use(express.json());
app.use(morgan('combined'));

// the safe crap
let safe = {
  state: "closed",
  time: 0,
}

// APN stuff
var apnOptions = {
  token: {
    key: process.env.APN_KEYFILE,
    keyId: process.env.APN_KEYID,
    teamId: process.env.APN_TEAMID,
  },
  production: false
};

var apnProvider = new apn.Provider(apnOptions);
var deviceTokens = [];

// helper functions (THESE ARE NOT HOISTED!!!)
var sendNotif = (token, event, message, badge) => {
  var notif = new apn.Notification();
  notif.expiry = Math.floor(Date.now() / 1000 + 3600);
  // notif.badge = 0; // send ASAP
  notif.sound = "ping.aiff";
  notif.title = `Safe ${event}!`;
  notif.body = `${message}`;
  notif.topic = process.env.APN_BUNDLEID;
  apnProvider.send(notif, token).then((result) => {
    console.log(`Message sent to ${token}`);
  })
} 

var getTimeString = (timestamp) => {
  let date = new Date()
  date.setTime(timestamp)
  console.log(date)
  return `${date.getHours()}:${date.getMinutes()} - ${date.toDateString()}`
}

var logUnsent = (event, timestamp) => {
  fs.readFile('unsent.json', 'utf-8', (err, data) => {
    if (err) {
      throw err
    }
    /*
    {
       devices: {
         'DEVICE_TOKEN': [{ unsent entry}, {unsent entry}, ...]
       }
    }
    */

    try {
      devices = JSON.parse(data)
    } catch {
      devices = {}
    }
    deviceTokens.forEach((token) => {
      unsent = devices[token]
      if (unsent === undefined) {
        unsent = []
      }
      unsent.push({event: event, timestamp: timestamp})
      devices[token] = unsent
    })
    // here i should remove dupes... ?
    console.log(devices)
    fs.writeFile('unsent.json', JSON.stringify(devices), 'utf-8', (err, data) => {
      if (err) {
        throw err
      }
    })
  })
}

// routes
app.post('/token', (req, res) => {
  fs.readFile('tokens.json', 'utf-8', (err, data) => {
    if (err) {
      throw err;
    }
    // if the token file is empty
    try {
      tokens = JSON.parse(data)['tokens'];
    } catch (error) {
      tokens = []
    }
    tokens.push(req.body['token']);
    let tokenJson = {
      tokens: [...new Set(tokens)]
    }
    
    fs.writeFile('tokens.json', JSON.stringify(tokenJson), 'utf-8', (err, data) => {
      if (err) {
        throw err;
      }

      // load the tokens into the new device Token
      deviceTokens = tokens;
      res.send(JSON.stringify({response: "ok"}));
    });
  });
});

app.post('/event', (req, res) => {
  // handles 3 types of events
  /*
  {
    event: opened|closed|critical,
    timestamp: UNIX timestamp of event Date().getTime() to get the UNIX time && Date().setTime() to set it... 
    secret: So this can't be spammed...
  }
  */

  // consume the body
  let body = req.body;
  if (body.secret != process.env.SECRET) {
    console.log(process.env.SECRET)
    res.send(JSON.stringify({response: "Incorrect secret"}))
    return
  }
  console.log(body)
  console.log(`deviceTokens: ${deviceTokens.length}`)
  switch (body.event) {
    case "opened":
      // put the safe into the open position
      safe.state = "opened";
      deviceTokens.forEach((token) => {
        sendNotif(token, "opened", `${getTimeString(body.timestamp)}`, 1);
      })
      console.log('safe opened');
      break;

    case "closed":
      // put the safe into the close position
      safe.state = "closed";
      safe.time = 0;
      deviceTokens.forEach((token) => {
        console.log(body);
        sendNotif(token, "closed", `${getTimeString(body.timestamp)}`, 1);
      })
      console.log('safe closed');
      break;
    
    case "critical":
      safe.state = "critical";
      console.log('safe critical');
      deviceTokens.forEach((token) => {
        sendNotif(token, "critical", `${getTimeString(body.timestamp)}`, 1);
      })
      break;

    default:
      console.log('What happened?');
      res.status(500)
      res.send(JSON.stringify({response: "An unknown error occured"}))
      return;
      break;
  }
  // log it to the unsent file
  logUnsent(body.event, body.timestamp)
  res.send(JSON.stringify({response: "ok"}));
});

app.post('/fetch', (req, res) => {
  /* incoming json structure 
  {
    "token": "device_token"
  }

  outgoing JSON structure
  {
    events: [
      {event, timestamp},
      ...
    ]
  }
  */
 
 let body = req.body
 let responseObject = {}
 fs.readFile('unsent.json', 'utf-8', (err, data) => {
   if (err) {
     throw err
   }
   try {
     devices = JSON.parse(data)
   } catch {
     devices = {}
   }
   let unsent = devices[body.token]
   if (unsent) {
     console.log("unset was set")
    //  responseObject['events'] = [unsent.length]
    responseObject['events'] = unsent
    // remove the token from the unsent now
    delete devices[body.token]
    fs.writeFile('unsent.json', JSON.stringify(devices), 'utf-8', (err, data) => {
      if (err) {
        throw err
      }
    })
   } else {
     console.log("unset was not set")
     responseObject['events'] = []
   }
   console.log(JSON.stringify(responseObject))
   res.send(JSON.stringify(responseObject))
 })
});

app.get('/demo', (req, res) => {
  var demo = new apn.Notification();
  demo.expiry = Math.floor(Date.now() / 1000 + 3600);
  demo.sound = "ping.aiff";
  demo.title = "This is a demo!";
  demo.body = "Hello, world!";
  demo.topic = process.env.APN_BUNDLEID;
  console.log(util.inspect(demo));

  apnProvider.send(demo, 'ca5053068d1464f5a50917184185d2c12136d4f90446e4edf9a04b74bdb01ff4').then( (result) => {
    console.log(result);
  });
  res.send('maybe?');
});

app.get('/', (req, res) => {
  res.send(`If you're reading this, something's working...`);
})

app.listen(port, () => {
  // load the tokens into the deviceTokens
  // ensures the tokenfile exists
  fs.closeSync(fs.openSync('tokens.json', 'a'))
  fs.closeSync(fs.openSync('unsent.json', 'a'))
  fs.readFile('tokens.json', 'utf-8', (err, data) => {
    if (err) {
      throw err;
    }
    // if the token file is empty
    try {
      tokens = JSON.parse(data)['tokens'];
    } catch (error) {
      tokens = [];
    }
    deviceTokens = tokens;
    console.log(`Tokens listening: ${deviceTokens.length}`)
  });
  console.log(`Listening on https://localhost:${port}`);
})
