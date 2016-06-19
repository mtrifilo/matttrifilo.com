
const compression = require('compression');
const express     = require('express');
const app         = express();

app.use(compression());

app.use('/', express.static(__dirname + '/public'));

app.use('/projects/weather', express.static(__dirname + '/projects/FCC-weather/public'));

app.get('/test', (req, res) => {
    res.end('<h1>IT WORKS!</h1>');
});

app.listen(4000, () => {
    console.log('Express app listening on port 4000!');
});