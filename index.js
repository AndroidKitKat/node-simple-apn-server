const express = require('express');
const util = require('util');
const app = express();
const fs = require('fs');
const bodyparser = require('body-parser');

const port = 4000;

app.use(express.json());

app.post('/token', (req, res) => {
  // open token file 
  fs.closeSync(fs.openSync('tokens.json', 'a'))
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
      res.send(JSON.stringify(tokenJson));
    });
  });
});

app.listen(port, () => {
  console.log(`Listening on https://localhost:${port}`);
})
