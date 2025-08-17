// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localOverlay = document.getElementById('localOverlay');
const remoteOverlay = document.getElementById('remoteOverlay');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const startButton = document.getElementById('startButton');
const nextButton = document.getElementById('nextButton');
const stopButton = document.getElementById('stopButton');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const interestInput = document.getElementById('interestInput');
const settingsToggle = document.getElementById('settingsToggle');
const settingsContent = document.getElementById('settingsContent');
const permissionModal = document.getElementById('permissionModal');
const grantPermission = document.getElementById('grantPermission');
const denyPermission = document.getElementById('denyPermission');
const reportModal = document.getElementById('reportModal');
const reportLink = document.getElementById('reportLink');
const submitReport = document.getElementById('submitReport');
const cancelReport = document.getElementById('cancelReport');
const privacyLink = document.getElementById('privacyLink');

// Global variables
let localStream;
let peerConnection;
let socket;
let roomId = null;
let isCaller = false;
let dataChannel;

// Initialize the app
async function init() {
    // Check for media devices
    await checkMediaDevices();
    
    // Set up event listeners
    setupEventListeners();
    
    // Connect to signaling server
    connectToSignalingServer();
}

// Check available media devices
async function checkMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        updateDeviceSelectors(devices);
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

// Update device selectors
function updateDeviceSelectors(devices) {
    videoSelect.innerHTML = '';
    audioSelect.innerHTML = '';
    
    // Add default option
    const defaultVideoOption = document.createElement('option');
    defaultVideoOption.value = '';
    defaultVideoOption.textContent = 'Default Camera';
    videoSelect.appendChild(defaultVideoOption);
    
    const defaultAudioOption = document.createElement('option');
    defaultAudioOption.value = '';
    defaultAudioOption.textContent = 'Default Microphone';
    audioSelect.appendChild(defaultAudioOption);
    
    // Add video devices
    devices.filter(device => device.kind === 'videoinput').forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${videoSelect.length}`;
        videoSelect.appendChild(option);
    });
    
    // Add audio devices
    devices.filter(device => device.kind === 'audioinput').forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${audioSelect.length}`;
        audioSelect.appendChild(option);
    });
}

// Set up event listeners
function setupEventListeners() {
    // Button events
    startButton.addEventListener('click', startChat);
    nextButton.addEventListener('click', nextStranger);
    stopButton.addEventListener('click', stopChat);
    sendButton.addEventListener('click', sendMessage);
    
    // Message input events
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Settings toggle
    settingsToggle.addEventListener('click', () => {
        settingsContent.classList.toggle('active');
    });
    
    // Device selection changes
    videoSelect.addEventListener('change', restartVideoWithNewDevice);
    audioSelect.addEventListener('change', restartVideoWithNewDevice);
    
    // Permission modal buttons
    grantPermission.addEventListener('click', () => {
        permissionModal.classList.remove('active');
        startChat();
    });
    
    denyPermission.addEventListener('click', () => {
        permissionModal.classList.remove('active');
        startChat(false);
    });
    
    // Report modal
    reportLink.addEventListener('click', (e) => {
        e.preventDefault();
        reportModal.classList.add('active');
    });
    
    submitReport.addEventListener('click', submitReportHandler);
    cancelReport.addEventListener('click', () => {
        reportModal.classList.remove('active');
    });
    
    privacyLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'privacy.html';
    });
}

// Connect to signaling server
function connectToSignalingServer() {
    socket = io(window.location.origin);
    
    socket.on('connect', () => {
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    socket.on('user-count', (count) => {
    document.getElementById('userCount').textContent = `${count} Online`;
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showMessage('System', 'Connection error occurred', 'error');
    });
    
    socket.on('paired', (data) => {
        roomId = data.roomId;
        isCaller = data.isCaller;
        showMessage('System', `You are now connected with a stranger${isCaller ? ' (You are the caller)' : ''}`, 'system');
        connectionStatus.textContent = 'Connected with stranger';
        
        if (isCaller) {
            createPeerConnection();
            setupDataChannel();
            startCall();
        } else {
            createPeerConnection();
        }
        
        updateButtonStates(true);
    });
    
    socket.on('offer', async (offer) => {
        if (!peerConnection) createPeerConnection();
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { answer, roomId });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    });
    
    socket.on('answer', async (answer) => {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    });
    
    socket.on('ice-candidate', async (candidate) => {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });
    
    socket.on('message', (message) => {
        showMessage('Stranger', message, 'remote');
    });
    
    socket.on('stranger-disconnected', () => {
        showMessage('System', 'Stranger has disconnected', 'system');
        connectionStatus.textContent = 'Stranger disconnected';
        updateButtonStates(false);
        cleanupPeerConnection();
    });
}

// Update connection status UI
// Replace the updateConnectionStatus function with:
function updateConnectionStatus(connected) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    
    if (connected) {
        statusText.textContent = 'Connected';
        statusDot.classList.add('connected');
    } else {
        statusText.textContent = 'Disconnected';
        statusDot.classList.remove('connected');
        document.getElementById('userCount').textContent = '0 Online';
    }
}

// Start chat session
async function startChat(withMedia = true) {
    try {
        if (withMedia) {
            const constraints = {
                video: {
                    deviceId: videoSelect.value ? { exact: videoSelect.value } : undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    deviceId: audioSelect.value ? { exact: audioSelect.value } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            localVideo.srcObject = localStream;
        } else {
            showMessage('System', 'You are in text-only mode', 'system');
        }
        
        const interests = interestInput.value.trim();
        socket.emit('join-queue', { interests: interests ? interests.split(',').map(i => i.trim()) : [] });
        connectionStatus.textContent = 'Looking for a stranger...';
        startButton.disabled = true;
        stopButton.disabled = false;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        
        if (error.name === 'NotAllowedError') {
            permissionModal.classList.add('active');
        } else {
            showMessage('System', 'Could not access camera/microphone', 'error');
            startChat(false);
        }
    }
}

// Create RTCPeerConnection
function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add your TURN server configuration here in production
            // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
        ]
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks if available
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && roomId) {
            socket.emit('ice-candidate', { candidate: event.candidate, roomId });
        }
    };
    
    // Track handler for remote stream
    peerConnection.ontrack = (event) => {
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = event.streams[0];
        }
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        switch (peerConnection.connectionState) {
            case 'connected':
                //connectionStatus.textContent =  'Connected with stranger';
                connectionStatus.style.display = 'none'; // hide it completely
                break;
            case 'disconnected':
            case 'failed':
                connectionStatus.textContent = 'Connection lost';
                showMessage('System', 'Connection with stranger lost', 'system');
                updateButtonStates(false);
                break;
            case 'closed':
                connectionStatus.textContent = 'Connection closed';
                break;
        }
    };
    
    // Data channel handler for callee
    peerConnection.ondatachannel = (event) => {
        setupDataChannel(event.channel);
    };
}

// Setup data channel
function setupDataChannel(channel) {
    if (channel) {
        dataChannel = channel;
    } else {
        dataChannel = peerConnection.createDataChannel('chat');
    }
    
    dataChannel.onopen = () => {
        console.log('Data channel opened');
        messageInput.disabled = false;
        sendButton.disabled = false;
    };
    
    dataChannel.onclose = () => {
        console.log('Data channel closed');
        messageInput.disabled = true;
        sendButton.disabled = true;
    };
    
    dataChannel.onmessage = (event) => {
        showMessage('Stranger', event.data, 'remote');
    };
}

// Start call (for caller)
async function startCall() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, roomId });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Send message through data channel
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
        showMessage('You', message, 'local');
        messageInput.value = '';
    }
}

// Show message in chat
function showMessage(sender, message, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', type);
    
    const senderElement = document.createElement('strong');
    senderElement.textContent = `${sender}: `;
    
    const textElement = document.createElement('span');
    textElement.textContent = message;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(textElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Next stranger
function nextStranger() {
    if (roomId) {
        socket.emit('next', { roomId });
        cleanupPeerConnection();
        roomId = null;
        connectionStatus.textContent = 'Looking for a new stranger...';
        updateButtonStates(false);
        const interests = interestInput.value.trim();
        socket.emit('join-queue', { interests: interests ? interests.split(',').map(i => i.trim()) : [] });
    }
}

// Stop chat
function stopChat() {
    if (roomId) {
        socket.emit('leave', { roomId });
    }
    cleanupPeerConnection();
    roomId = null;
    connectionStatus.textContent = 'Disconnected';
    updateButtonStates(false);
    startButton.disabled = false;
    stopButton.disabled = true;
    nextButton.disabled = true;
    
    // Clear remote video
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
}

// Clean up peer connection
function cleanupPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
}

// Restart video with new device
async function restartVideoWithNewDevice() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    try {
        const constraints = {
            video: {
                deviceId: videoSelect.value ? { exact: videoSelect.value } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                deviceId: audioSelect.value ? { exact: audioSelect.value } : undefined,
                echoCancellation: true,
                noiseSuppression: true
            }
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        
        // If in a call, replace the tracks
        if (peerConnection && peerConnection.signalingState !== 'closed') {
            const senders = peerConnection.getSenders();
            senders.forEach(sender => {
                if (sender.track.kind === 'audio') {
                    const audioTrack = localStream.getAudioTracks()[0];
                    if (audioTrack) sender.replaceTrack(audioTrack);
                } else if (sender.track.kind === 'video') {
                    const videoTrack = localStream.getVideoTracks()[0];
                    if (videoTrack) sender.replaceTrack(videoTrack);
                }
            });
        }
    } catch (error) {
        console.error('Error changing devices:', error);
        showMessage('System', 'Failed to change devices', 'error');
    }
}

// Update button states
function updateButtonStates(inCall) {
    startButton.disabled = inCall;
    nextButton.disabled = !inCall;
    messageInput.disabled = !inCall;
    sendButton.disabled = !inCall;
}

// Submit report handler
function submitReportHandler() {
    const reportText = document.getElementById('reportText').value.trim();
    if (reportText) {
        // In a real app, you would send this to your backend
        console.log('Report submitted:', reportText);
        showMessage('System', 'Thank you for your report. We will review it shortly.', 'system');
        reportModal.classList.remove('active');
        document.getElementById('reportText').value = '';
        
        // End the current chat if in one
        if (roomId) {
            stopChat();
        }
    } else {
        alert('Please describe the issue before submitting.');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
