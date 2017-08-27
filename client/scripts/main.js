var Babble = (function() {
    var counter = 0;
    var currentUUID = 0;
    var matchIdAndTimestamp = [];
    var url = 'http://localhost:9000';

    console.log('hello from client');

    resetLocalStorage();
    showDialogAndListen();
    messageToLocalstorageListener();
    userLogoutListener();
    sendMessageListener();

    // Logic is as follows:

    // resetLocalStorage():
    // Reset the local storage values.

    // showDialogAndListen():
    // The communication between the server and the client is implemented as long polling.
    // A modal dialog is shown to the user, asking him for name and email.
    // The browser listens until the form is submited,
    // than saves the deatils of the user in the local storage
    // and opens 2 pool requests to the server: stats and messages.

    // messageToLocalstorageListener():
    // Each time the client's message changes, it's updated in the local storage of the browser.

    // userLogoutListener():
    // Make sure the browser will send the server an appropriate message when 
    // the user closes the tab of the messages.

    // sendMessageListener():
    // Waiting for the user to click the send button,
    // invokes the sending of a message to the server (postMessage);

    function resetLocalStorage() {
        var userInfo = { name: '', email: '' };
        babble = { "currentMessage": '', "userInfo": userInfo };
        localStorage.setItem('babble', JSON.stringify(babble));
    }


    function showDialogAndListen() {
        var dialog = document.querySelector('dialog');
        var modalForm = document.querySelector('dialog > form');

        if (dialog === null || modalForm === null) {
            return false;
        }

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

    function getStats(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/stats');
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText));
        });
        xhr.send();
    }

    function getMessages(counter, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/messages?counter=' + counter);
        currentUUID = generateUUID();
        xhr.setRequestHeader('X-Request-ID', currentUUID);
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), counter);
        });
        xhr.send();
    }

    // Took from this cool guy https://gist.github.com/jed/982883
    function generateUUID(a) {
        return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, generateUUID);
    }

    function proccessMessages(messages, counter) {
        messages.forEach(function(message) {
            if (message != "")
                addMessageToChat(message);
        });

        counter += messages.length;
        getMessages(counter, proccessMessages);
    }

    function messageToLocalstorageListener() {
        // Update the local storage to current message
        var userText = document.querySelector('textarea');

        if (userText === null) {
            return false;
        }

        userText.addEventListener("keyup", function(evt) {
            var localState = JSON.parse(localStorage.babble);
            localState.currentMessage = userText.value;
            localStorage.setItem('babble', JSON.stringify(localState));
        }, false);
    }

    function userLogoutListener() {
        window.addEventListener('unload', function() {
            navigator.sendBeacon(url + '/logout', JSON.stringify(currentUUID));
        });
    }

    function sendMessageListener() {
        var form = document.querySelector('section > form');

        if (form === null) {
            return false;
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
    }

    function postMessage(message, callback) {
        // var form = document.querySelector('section > form');
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url + '/messages');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        // if (form.method === 'post') {
        //     xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        // }
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), message.timestamp);
        });
        // console.log(form.action + " and method is " + form.method);
        console.log(message);
        xhr.send(JSON.stringify(message));
    }

    function trackUserMessages(serverResponse, timestamp) {
        var messageIdAndTimestemp = { "id": serverResponse.id, "timestamp": timestamp };
        matchIdAndTimestamp.push(messageIdAndTimestemp);
    }

    function invokeDeleteMessage(element) {
        var messageToDelete = element.closest('li');
        timestampOfIdToDelete = messageToDelete.getAttribute('id');
        matching = matchIdAndTimestamp.filter(function(message) { return message.timestamp == timestampOfIdToDelete; });
        idToDelete = matching[0].id;

        deleteMessage(idToDelete, hideMessageByID);
    }

    function deleteMessage(id, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('DELETE', url + '/messages/' + id, true);
        // xhr.setRequestHeader('X-Request-ID', 'value');
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), id);
        });
        xhr.send();
    }

    // All the logic related to dealing with the client's HTML content.
    // Summery:
    // - Updating the user stats
    // - Deleting a message
    // - Class names for the created messages
    // - Logic of adding a message: addMessageToChat(message) and all that follows.

    function updateStats(stats) {
        var mesCounterObject = document.querySelector('dd:first-of-type');
        var userCounterObject = document.querySelector('dd:last-of-type');

        mesCounterObject.innerText = stats.messages;
        userCounterObject.innerText = stats.users;

        getStats(updateStats);
    }

    function hideMessageByID(confirmation, id) {
        if (confirmation === true) {
            matching = matchIdAndTimestamp.filter(function(message) { return message.id === id; });
            timestampToDelete = matching[0].timestamp;
            toHide = document.getElementById(timestampToDelete);
            toHide.style.display = "none";
        }
    }

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

    function addMessageToChat(message) {
        var messages = document.querySelector('.' + classNames.messages);

        var holeMessage = document.createElement("li");
        holeMessage.setAttribute('id', message.timestamp);

        profileURL = 'https://www.gravatar.com/avatar/' + message.emailHash + '.jpg?d=identicon';
        profileImage = createMessageProfilePic(encodeURI(profileURL));
        messageBox = createMessageBox(message.message, message.name, parseTime(message.timestamp), message.email);

        holeMessage.appendChild(profileImage);
        holeMessage.appendChild(messageBox);

        messages.appendChild(holeMessage);
        messages.scrollTop = messages.scrollHeight;

        // TODO: Had problems with timing. Rethink

        // profileImage.addEventListener("load", function() {
        //     messages.appendChild(holeMessage);
        //     messages.scrollTop = messages.scrollHeight;
        // });
    }

    function createMessageProfilePic(imgPath) {
        var profileImage = new Image();
        profileImage.src = imgPath;
        profileImage.className = classNames.messageImg;

        return profileImage;
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

    function createExitButton() {
        var button = document.createElement('button');
        var buttonText = document.createTextNode('x');
        button.setAttribute('class', classNames.messageX);
        button.setAttribute('onclick', 'Babble.invokeDeleteMessage(this)');
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

    function createMessageContent(userContent) {
        var paragraph = document.createElement('p');
        var userText = document.createTextNode(userContent);
        paragraph.setAttribute('class', classNames.messageText);
        paragraph.appendChild(userText);

        return paragraph;
    }

    return {
        register: register,
        getMessages: getMessages,
        postMessage: postMessage,
        deleteMessage: deleteMessage,
        getStats: getStats,
        invokeDeleteMessage: invokeDeleteMessage
    };
})();