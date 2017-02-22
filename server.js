const compression = require('compression');
const express     = require('express');
const app         = express();

app.use(compression());

app.use('/', express.static(__dirname + '/public', { maxAge: 9000000 }));

app.listen(4000, () => {
    console.log('Express app listening on port 4000!');
    console.log('environment:', process.env.NODE_ENV)
});