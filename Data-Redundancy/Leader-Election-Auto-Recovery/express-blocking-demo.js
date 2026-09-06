const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Non-blocking route
app.get('/non-blocking', (req, res) => {
  res.status(200).send('This page is non-blocking.');
});

// Blocking route using Worker Threads
app.get('/blocking', (req, res) => {
  let result = 0;
  for (let i = 0; i < 1000000000; i++) {
    result++;
  }
  res.status(200).send(`Result is ${result}`);
});

// Start the server
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
