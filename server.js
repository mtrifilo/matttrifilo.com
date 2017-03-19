const compression = require('compression');
const express = require('express');
const app = express();
const path = require('path');

app.use(compression());

app.use('/', express.static(__dirname + '/public', { maxAge: 9000000 }));

app.get('/resume', (req, res) => {
    res.sendFile(path.join(__dirname + '/resume.html'));
});

app.listen(4000, () => {
    console.log('Express app listening on port 4000!');
    console.log('environment:', process.env.NODE_ENV);
});