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

function createMessageProfilePic(imgPath) {
    var profileImage = document.createElement('img');
    profileImage.setAttribute('src', imgPath);
    profileImage.setAttribute('class', classNames.messageImg);

    return profileImage;
}

function createExitButton() {
    var button = document.createElement('button');
    var buttonText = document.createTextNode('x');
    button.setAttribute('class', classNames.messageX);
    button.setAttribute('onclick', 'hideMessage(this)');
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

function createMessageBox(userText, userName, userMessageTime) {
    var messageBox = document.createElement('article');
    messageBox.setAttribute('class', classNames.messageBox);

    var button = createExitButton();
    var name = createMessageName(userName);
    var time = createMessageTime(userMessageTime);
    var paragraph = createMessageContent(userText);

    messageBox.appendChild(button);
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

function makeTimePretty(time) {
    if (time >= 0 && time <= 9) {
        time = '0' + time;
    }
    return time;
}

function addMessageToChat(userInput) {
    var holeMessage = document.createElement("li");
    // var userInput = document.querySelector('.' + classNames.inputArea + ' textarea').value;

    profileImage = createMessageProfilePic('profilePic.jpg');
    messageBox = createMessageBox(userInput, 'Dolev Nishlis', returnCurrentTime());

    holeMessage.appendChild(profileImage);
    holeMessage.appendChild(messageBox);

    var messages = document.querySelector('.' + classNames.messages);
    messages.appendChild(holeMessage);

    messages.scrollTop = messages.scrollHeight;
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

function getMessages(counter, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://localhost:9097/poll?counter=' + counter);
    xhr.addEventListener('load', function(e) {
        callback(e);
    });
    xhr.send();
}



function proccessMessages(rawMessages) {
    var messages = JSON.parse(rawMessages.target.responseText);
    messageCount += messages.length;

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
});

var form = document.querySelector('section > form');
var userText = document.querySelector('textarea');

// Update the local storage to current message
userText.addEventListener("keyup", function(evt) {
    var localState = JSON.parse(localStorage.babble);
    localState.currentMessage = userText.value;
    localStorage.setItem('babble', JSON.stringify(localState));
}, false);

function postMessage(message, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(form.method, form.action);
    if (form.method === 'post') {
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    xhr.addEventListener('load', function(e) {
        callback(e);
    });
    xhr.send(data);
}

// Figure this out!
function doNothing(e) {
    // does nothing
}

// form.addEventListener('submit', function(e) {
//     e.preventDefault();

//     var parseLocalDate = JSON.parse(localStorage.babble);
//     var userMessage = {
//         "name": parseLocalDate.name,
//         "email": parseLocalDate.email,
//         "message": parseLocalDate.currentMessage,
//         "timestamp": Data.now()
//     };

//     console.log(form.action);
//     postMessage(userMessage, doNothing);
// });

form.addEventListener('submit', function(e) {
    var parseLocalDate = JSON.parse(localStorage.babble);
    var userMessage = { "currentMessage": parseLocalDate.currentMessage, "counter": counter };

    e.preventDefault();
    console.log(form.action);
    console.log(userMessage);
    var data = '';
    for (var i = 0; i < form.elements.length; i++) {
        var element = form.elements[i];
        if (element.name) {
            data += element.name + '=' + encodeURIComponent(element.value) + '&';
        }
    }

    data += 'counter' + '=' + encodeURIComponent(counter);

    var xhr = new XMLHttpRequest();
    xhr.open(form.method, form.action);
    if (form.method === 'post') {
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    xhr.addEventListener('load', function(e) {
        addMessageToChat(e.target.responseText);
        console.log(e.target.responseText);
    });
    xhr.send(data);
});