const classNames = {
    messages: 'messages',
    messageImg: 'message-image',
    messageText: 'message-text',
    messageBox: 'message-box',
    messageX: 'message-close',
    messageName: 'message-name',
    messageTime: 'message-time',
    inputArea: 'user-input-area'
};

function hideMessage(element) {
    var toHide = element.closest('li');
    toHide.style.display = "none";
}

function hideMessageByID(id, serverConfirmation) {
    var confirmation = JSON.parse(serverConfirmation.target.responseText);
    if (confirmation === true) {
        matching = matchIdAndTimestamp.filter(function(message) { return message.id === id; });
        timestampToDelete = matching[0].timestamp;
        toHide = document.getElementById(timestampToDelete);
        toHide.style.display = "none";
    }
}

function createMessageProfilePic(imgPath) {
    // var profileImage = document.createElement('img');
    // profileImage.setAttribute('src', imgPath);
    // profileImage.setAttribute('class', classNames.messageImg);

    var profileImage = new Image();
    profileImage.src = imgPath;
    profileImage.className = classNames.messageImg;

    return profileImage;
}

function deleteMessage(id, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', 'http://localhost:9097/messages/' + id, true);
    // xhr.setRequestHeader('X-Request-ID', 'value');
    xhr.addEventListener('load', function(e) {
        callback(id, e);
    });
    xhr.send();
}

function invokeDeleteMessage(element) {
    var messageToDelete = element.closest('li');
    timestampOfIdToDelete = messageToDelete.getAttribute('id');
    matching = matchIdAndTimestamp.filter(function(message) { return message.timestamp == timestampOfIdToDelete; });
    idToDelete = matching[0].id;

    deleteMessage(idToDelete, hideMessageByID);
}

function createExitButton() {
    var button = document.createElement('button');
    var buttonText = document.createTextNode('x');
    button.setAttribute('class', classNames.messageX);
    button.setAttribute('onclick', 'invokeDeleteMessage(this)');
    button.appendChild(buttonText);

    return button;
}

function createMessageName(userName) {
    var name = document.createElement('cite');
    var nameText = document.createTextNode(userName);
    name.setAttribute('class', classNames.messageName);
    name.appendChild(nameText);

    return name;
}

function createMessageTime(currentTime) {
    var time = document.createElement('time');
    var timeText = document.createTextNode(currentTime);
    time.setAttribute('datetime', '08:00+03:00');
    time.setAttribute('class', classNames.messageTime);
    time.appendChild(timeText);

    return time;
}

function createMessageContent(userContent) {
    var paragraph = document.createElement('p');
    var userText = document.createTextNode(userContent);
    paragraph.setAttribute('class', classNames.messageText);
    paragraph.appendChild(userText);

    return paragraph;
}

function createMessageBox(userText, userName, userMessageTime, userEmail) {
    var messageBox = document.createElement('article');
    messageBox.setAttribute('class', classNames.messageBox);

    if (userEmail === JSON.parse(localStorage.babble).userInfo.email) {
        var button = createExitButton();
        messageBox.appendChild(button);
    }

    var name = createMessageName(userName);
    var time = createMessageTime(userMessageTime);
    var paragraph = createMessageContent(userText);

    messageBox.appendChild(name);
    messageBox.appendChild(time);
    messageBox.appendChild(paragraph);

    return messageBox;
}

function returnCurrentTime() {
    var currentTime = new Date();
    var h = makeTimePretty(currentTime.getHours());
    var m = makeTimePretty(currentTime.getMinutes());

    return h + ':' + m;
}

function parseTime(time) {
    var userTime = new Date(time);
    var h = makeTimePretty(userTime.getHours());
    var m = makeTimePretty(userTime.getMinutes());

    return h + ':' + m;
}

function makeTimePretty(time) {
    if (time >= 0 && time <= 9) {
        time = '0' + time;
    }
    return time;
}

// function addMessageToChat(userInput) {
//     var holeMessage = document.createElement("li");
//     // var userInput = document.querySelector('.' + classNames.inputArea + ' textarea').value;

//     profileImage = createMessageProfilePic('images/profilePic.jpg');
//     messageBox = createMessageBox(userInput, 'Dolev Nishlis', returnCurrentTime());

//     holeMessage.appendChild(profileImage);
//     holeMessage.appendChild(messageBox);

//     var messages = document.querySelector('.' + classNames.messages);
//     messages.appendChild(holeMessage);

//     messages.scrollTop = messages.scrollHeight;
// }

function addMessageToChat(message) {
    var messages = document.querySelector('.' + classNames.messages);

    var holeMessage = document.createElement("li");
    holeMessage.setAttribute('id', message.timestamp);

    profileURL = 'https://www.gravatar.com/avatar/' + message.emailHash + '.jpg?d=identicon';
    profileImage = createMessageProfilePic(encodeURI(profileURL));
    messageBox = createMessageBox(message.message, message.name, parseTime(message.timestamp), message.email);

    holeMessage.appendChild(profileImage);
    holeMessage.appendChild(messageBox);

    profileImage.addEventListener("load", function() {
        messages.appendChild(holeMessage);
        messages.scrollTop = messages.scrollHeight;
    });
}

function userInfo(name, email) {
    this.name = name;
    this.email = email;
}

function message(name, email, message, timestamp) {
    this.name = name;
    this.email = email;
    this.message = message;
    this.timestamp = timestamp;
}

function register(userInfo) {
    var babble = { "currentMessage": "", "userInfo": userInfo };
    localStorage.setItem('babble', JSON.stringify(babble));
}

var currentUUID = 0;

// Took from this cool guy https://gist.github.com/jed/982883
function generateUUID(a) {
    return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, generateUUID);
}

function getMessages(counter, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://localhost:9097/messages?counter=' + counter);
    currentUUID = generateUUID();
    xhr.setRequestHeader('X-Request-ID', currentUUID);
    xhr.addEventListener('load', function(e) {
        callback(counter, e);
    });
    xhr.send();
}

function updateStats(e) {
    var stats = JSON.parse(e.target.responseText);
    var mesCounterObject = document.querySelector('dd:first-of-type');
    var userCounterObject = document.querySelector('dd:last-of-type');

    mesCounterObject.innerText = stats.messages;
    userCounterObject.innerText = stats.users;

    getStats(updateStats);
}

function getStats(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://localhost:9097/stats');
    xhr.addEventListener('load', function(e) {
        callback(e);
    });
    xhr.send();
}

function proccessMessages(counter, rawMessages) {
    var messages = JSON.parse(rawMessages.target.responseText);

    messages.forEach(function(message) {
        addMessageToChat(message);
    });

    counter += messages.length;
    getMessages(counter, proccessMessages);
}

var counter = 0;

// modal.addEventListener('submit', function(e) {
//     e.preventDefault();

//     var userInformation = new userInfo(modal.name.value, modal.email.value);
//     register(userInformation);
// });

console.log('hello from client');

var dialog = document.querySelector('dialog');
var modalForm = document.querySelector('dialog > form');
dialogPolyfill.registerDialog(dialog);
dialog.showModal();

dialog.addEventListener('close', function(event) {
    if (dialog.returnValue == 'save') {
        var userInformation = new userInfo(modalForm.name.value, modalForm.email.value);
        register(userInformation);
    } else {
        var userInformation = new userInfo('anonymous', 'anonymous');
        register(userInformation);
    }
    getStats(updateStats);
    getMessages(counter, proccessMessages);
});

var form = document.querySelector('section > form');
var userText = document.querySelector('textarea');

// Update the local storage to current message
userText.addEventListener("keyup", function(evt) {
    var localState = JSON.parse(localStorage.babble);
    localState.currentMessage = userText.value;
    localStorage.setItem('babble', JSON.stringify(localState));
}, false);

window.addEventListener('unload', function() {
    navigator.sendBeacon('http://localhost:9097/logout', JSON.stringify(currentUUID));
});


function postMessage(message, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(form.method, form.action);
    if (form.method === 'post') {
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    xhr.addEventListener('load', function(e) {
        callback(e, message.timestamp);
    });
    console.log(form.action + " and method is " + form.method);
    console.log(message);
    xhr.send(JSON.stringify(message));
}

var matchIdAndTimestamp = [];

function trackUserMessages(e, timestamp) {
    serverResponse = JSON.parse(e.target.responseText);
    var messageIdAndTimestemp = { "id": serverResponse.id, "timestamp": timestamp };
    matchIdAndTimestamp.push(messageIdAndTimestemp);
}

form.addEventListener('submit', function(e) {
    e.preventDefault();

    var parseLocalDate = JSON.parse(localStorage.babble);
    var userMessage = {
        "name": parseLocalDate.userInfo.name,
        "email": parseLocalDate.userInfo.email,
        "message": parseLocalDate.currentMessage,
        "timestamp": Date.now()
    };

    postMessage(userMessage, trackUserMessages);
});

// form.addEventListener('submit', function(e) {
//     var parseLocalDate = JSON.parse(localStorage.babble);
//     var userMessage = { "currentMessage": parseLocalDate.currentMessage, "counter": counter };

//     e.preventDefault();
//     console.log(form.action);
//     console.log(userMessage);
//     var data = '';
//     for (var i = 0; i < form.elements.length; i++) {
//         var element = form.elements[i];
//         if (element.name) {
//             data += element.name + '=' + encodeURIComponent(element.value) + '&';
//         }
//     }

//     data += 'counter' + '=' + encodeURIComponent(counter);

//     var xhr = new XMLHttpRequest();
//     xhr.open(form.method, form.action);
//     if (form.method === 'post') {
//         xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
//     }
//     xhr.addEventListener('load', function(e) {
//         addMessageToChat(e.target.responseText);
//         console.log(e.target.responseText);
//     });
//     xhr.send(data);
// });