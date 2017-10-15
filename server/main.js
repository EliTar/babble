//
// This server implements a long-polling scheme.
// Learn more by googling :)
//
// Written by Eli Tarnarutsky
//

var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');
var messages = require('./messages-util.js');

// Two long polling requests are executed concurrently.
// Following are the waiting lists for each one: messages and stats.

var waitingClients = [];
var statsWaitList = [];

// The server is waiting for requests starting with
// /messages, /stats and /logout.

// Each request is checked, and forwarded to an appropriate method
// for the actual implementation.

var server = http.createServer(function(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');

    var url = urlUtil.parse(request.url, true);

    if (url.pathname.startsWith('/messages')) {
        switch (request.method) {
            case 'GET':
                handleMessagesGet(url, request, response);
                break;
            case 'POST':
                handlePostRequest(request, response, handleMessagesPost);
                break;
            case 'DELETE':
                handleMessagesDelete(url, response);
                break;
            case 'OPTIONS':
                handleMessagesOptions(response);
                break;
            default:
                endResponseWithCode(response, 405); // Bad HTTP Method
                break;
        }
    } else if (url.pathname.startsWith('/stats')) {
        if (request.method === 'GET')
            handleStatsGet(request, response);
        else
            endResponseWithCode(response, 405); // Bad HTTP Method
    } else if (url.pathname.startsWith('/logout')) {
        if (request.method === 'POST')
            handlePostRequest(request, response, handleLogoutPost);
        else
            endResponseWithCode(response, 405); // Bad HTTP Method
    } else {
        if (request.method === 'OPTIONS')
            endResponseWithCode(response, 204);
        else
            endResponseWithCode(response, 404); // non-existent URL
    }
});

preventRequestTimeout();
server.listen(9000);
console.log('Server is on');

// Every 4 minutes all unanswered requests are timed out,
// and the connection with the client is terminated for the session.
// Therefore, each interval we check if there are any "old" requests,
// "free" them with an empty response and the client fires another request.

function preventRequestTimeout() {
    setInterval(function() {
        var expire = Date.now() - 80 * 1000;

        for (i = 0; i < waitingClients.length; i++) {
            if (waitingClients[i].timestamp < expire) {
                endResponseWithCode(waitingClients[i].response, 200);
                waitingClients.splice(i, 1);
            }
        }

        for (i = 0; i < statsWaitList.length; i++) {
            if (statsWaitList[i].timestamp < expire) {
                endResponseWithCode(statsWaitList[i].response, 200);
                statsWaitList.splice(i, 1);
            }
        }

    }, 10 * 1000);
}

function updateStats(isDeleted) {
    var tempLength = statsWaitList.length;
    if (isDeleted === true) { // If a user is deleted, he is not yet out of the waiting list.
        tempLength--;
    }

    while (statsWaitList.length > 0) {
        var client = statsWaitList.pop();
        var stats = {
            "users": Math.max(waitingClients.length, tempLength),
            "messages": messages.messagesArray.length - messages.getNumberOfDeletedMessages()
        };
        client.response.end(JSON.stringify(stats));
    }
}

// Gather the POST method data and pass it to a callback

function handlePostRequest(request, response, callback) {
    var requestBody = '';
    request.on('data', function(chunk) {
        requestBody += chunk.toString();
    });
    request.on('end', function() {
        var data = JSON.parse(requestBody);
        callback(data, response);
    });
}

// Add a message to the messages array,
// return it to every waiting client and update the stats,
// then return the message ID to the client.

function handleMessagesPost(data, response) {
    currentMessageID = messages.addMessage(data);

    waitingClients.forEach(function(client) {
        client.response.end(JSON.stringify(messages.getMessages(client.counter)));
    });

    updateStats(false);
    waitingClients.length = 0;

    currentMessageID = { id: currentMessageID };

    response.end(JSON.stringify(currentMessageID));
}

// Just long polling.
// The counter stands for the number of messages on the client side.
// If there are more messages on the server than on the client,
// immediately return all messages to match the current messages "state".
// Otherwise, add to the waiting queue.

function handleMessagesGet(url, request, response) {
    if (isNaN(url.query.counter)) { // Check for Data correctness.
        endResponseWithCode(response, 400); // Bad HTTP request
    } else {
        var counter = Number(url.query.counter);
        if (messages.messagesArray.length > counter) {
            if (counter == 0) // A user just logged in
                updateStats(false);
            response.end(JSON.stringify(messages.getMessages(counter)));
        } else {
            waitingClients.push({ request: request, response: response, counter: counter, timestamp: new Date().getTime() });
            if (messages.messagesArray.length == 0)
                updateStats(false);
        }
    }
}

function handleMessagesDelete(url, response) {
    if (isNaN(url.pathname.slice(url.pathname.lastIndexOf('/') + 1))) { // Check for Data correctness.
        endResponseWithCode(response, 400); // Bad HTTP request
    } else {
        var id = Number(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
        messages.deleteMessage(id);
        updateStats(false);
        response.end(JSON.stringify(true));
    }
}

function handleMessagesOptions(response) {
    // Worked accordig to this tutorial https://www.html5rocks.com/en/tutorials/cors/
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    response.setHeader('Access-Control-Allow-Headers', 'X-Request-ID');
    endResponseWithCode(response, 204);
}

function handleStatsGet(request, response) {
    statsWaitList.push({ request: request, response: response, timestamp: new Date().getTime() });
}

// The UUID is used to identify the user while keeping his privacy,
// enabling us to log him out without exposing who he is by the sent data.

function handleLogoutPost(data, response) {
    var userUUID = data;

    userToLogout = waitingClients.filter(function(user) { return user.request.headers['x-request-id'] === userUUID; });
    indexOfUserToLogout = waitingClients.indexOf(userToLogout[0]);

    if (indexOfUserToLogout > -1)
        waitingClients.splice(indexOfUserToLogout, 1);

    updateStats(true);
}

function endResponseWithCode(response, code) {
    response.statusCode = code;
    response.statusMessage = http.STATUS_CODES[code];
    response.end();
}