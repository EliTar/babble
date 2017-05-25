var http = require('http');

var server = http.createServer(function(request, response) {
    console.log(request.url);
    response.end();
});

server.listen(9000);

console.log("hello");