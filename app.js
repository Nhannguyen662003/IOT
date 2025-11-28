// Cấu hình MQTT
const MQTT_CONFIG = {
    host: "a117be9c8b5649ba8a56105f9ad4e770.s1.eu.hivemq.cloud",
    port: 8884,
    username: "ThienNhan",
    password: "ThienNhan@200366",
    clientId: "web-client-" + Math.random().toString(16).substr(2, 8)
};

// Các topic MQTT
const TOPIC_SENSOR = "thiennhan/esp32/sensor/data";
const TOPIC_COMMANDS = "thiennhan/esp32/commands";
const TOPIC_STATUS = "thiennhan/esp32/status";

// Thông số bồn nước
const TANK_HEIGHT = 20; // Chiều cao bồn tính từ cảm biến đến đáy bồn (cm)

// Biến toàn cục
let mqttClient = null;
let isConnected = false;
let reconnectTimer = null;
let systemData = {
    person_distance: 0,
    tank_distance: 0,
    valve_state: "closed",
    tank_full: false,
    person_detected: false,
    water_level: 0,
    water_speed: 0,
    flow_status: "Đang tải..."
};

// Kiểm tra MQTT library
function checkMqttLibrary() {
    if (typeof mqtt === 'undefined') {
        console.error('MQTT.js library not loaded');
        addLog('❌ Lỗi: Thư viện MQTT chưa được tải. Vui lòng kiểm tra kết nối internet.');
        return false;
    }
    return true;
}

// Kết nối MQTT
function connectMQTT() {
    if (!checkMqttLibrary()) {
        return;
    }

    try {
        console.log("Đang kết nối MQTT...");
        addLog("🔗 Đang kết nối MQTT...");
        updateConnectionStatus('connecting', 'Đang kết nối...');

        // Tạo URL kết nối
        const protocol = 'wss';
        const url = `${protocol}://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}/mqtt`;

        const options = {
            clientId: MQTT_CONFIG.clientId,
            username: MQTT_CONFIG.username,
            password: MQTT_CONFIG.password,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 10000
        };

        mqttClient = mqtt.connect(url, options);

        mqttClient.on('connect', onConnect);
        mqttClient.on('error', onError);
        mqttClient.on('close', onClose);
        mqttClient.on('message', onMessage);
        mqttClient.on('reconnect', onReconnect);
        mqttClient.on('offline', onOffline);

    } catch (error) {
        console.error("Lỗi kết nối MQTT:", error);
        updateConnectionStatus('error', 'Lỗi kết nối: ' + error.message);
        addLog("❌ Lỗi kết nối MQTT: " + error.message);
        scheduleReconnect();
    }
}

function onConnect() {
    console.log("Kết nối MQTT thành công!");
    isConnected = true;
    updateConnectionStatus('connected', 'Đã kết nối MQTT');
    
    // Đăng ký các topic
    mqttClient.subscribe(TOPIC_SENSOR, (err) => {
        if (!err) {
            console.log("Đã subscribe topic sensor");
        }
    });
    
    mqttClient.subscribe(TOPIC_STATUS, (err) => {
        if (!err) {
            console.log("Đã subscribe topic status");
        }
    });
    
    // Yêu cầu trạng thái hiện tại
    sendCommand("get_status");
    
    addLog("✅ Đã kết nối với MQTT Broker");
}

function onError(error) {
    console.error("Lỗi MQTT:", error);
    isConnected = false;
    updateConnectionStatus('error', 'Lỗi MQTT');
    addLog("❌ Lỗi MQTT: " + error.message);
}

function onClose() {
    console.log("Kết nối MQTT đóng");
    isConnected = false;
    updateConnectionStatus('disconnected', 'Mất kết nối MQTT');
    addLog("⚠️ Mất kết nối MQTT");
}

function onReconnect() {
    console.log("Đang kết nối lại MQTT...");
    updateConnectionStatus('connecting', 'Đang kết nối lại...');
    addLog("🔄 Đang kết nối lại MQTT...");
}

function onOffline() {
    console.log("MQTT offline");
    isConnected = false;
    updateConnectionStatus('disconnected', 'Offline');
    addLog("🔴 MQTT Offline");
}

function onMessage(topic, message) {
    try {
        const data = JSON.parse(message.toString());
        console.log("Nhận dữ liệu từ topic:", topic, data);
        
        if (topic === TOPIC_SENSOR) {
            processSensorData(data);
        } else if (topic === TOPIC_STATUS) {
            addLog("📢 " + data.status);
        }
    } catch (error) {
        console.error("Lỗi xử lý tin nhắn:", error);
        addLog("❌ Lỗi xử lý dữ liệu MQTT");
    }
}

function scheduleReconnect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(() => {
        addLog("🔄 Thử kết nối lại...");
        connectMQTT();
    }, 5000);
}

function processSensorData(data) {
    // Cập nhật dữ liệu hệ thống
    systemData = { ...systemData, ...data };
    
    // Cập nhật giao diện
    updatePersonStatus();
    updateValveStatus();
    updateTankStatus();
}

function updatePersonStatus() {
    const personStatus = document.getElementById('person-status');
    const personDistance = document.getElementById('person-distance');
    const personDistanceValue = document.getElementById('person-distance-value');
    const personDetectionStatus = document.getElementById('person-detection-status');
    
    if (systemData.person_detected) {
        personStatus.innerHTML = '<span class="status-indicator status-online"></span> CÓ NGƯỜI';
        personStatus.style.color = '#4caf50';
        personDetectionStatus.textContent = 'CÓ NGƯỜI';
        personDetectionStatus.style.color = '#4caf50';
    } else {
        personStatus.innerHTML = '<span class="status-indicator status-offline"></span> KHÔNG CÓ NGƯỜI';
        personStatus.style.color = '#f44336';
        personDetectionStatus.textContent = 'KHÔNG CÓ NGƯỜI';
        personDetectionStatus.style.color = '#f44336';
    }
    
    const distance = systemData.person_distance_cm || 0;
    personDistance.textContent = distance + ' cm';
    personDistanceValue.textContent = distance + ' cm';
}

function updateValveStatus() {
    const valveStatus = document.getElementById('valve-status');
    const flowStatus = document.getElementById('flow-status');
    const waterSpeedValue = document.getElementById('water-speed-value');
    
    if (systemData.valve_state === "open") {
        valveStatus.innerHTML = '<span class="status-indicator status-online"></span> VÒI MỞ';
        valveStatus.style.color = '#4caf50';
    } else {
        valveStatus.innerHTML = '<span class="status-indicator status-offline"></span> VÒI ĐÓNG';
        valveStatus.style.color = '#f44336';
    }
    
    // Cập nhật trạng thái dòng nước
    flowStatus.textContent = systemData.flow_status || "Đang tải...";
    
    // Áp dụng lớp CSS dựa trên trạng thái dòng nước
    flowStatus.className = 'flow-status';
    if (systemData.flow_status) {
        if (systemData.flow_status.includes("MẠNH")) {
            flowStatus.classList.add('flow-fast');
        } else if (systemData.flow_status.includes("BÌNH THƯỜNG")) {
            flowStatus.classList.add('flow-normal');
        } else if (systemData.flow_status.includes("CHẬM")) {
            flowStatus.classList.add('flow-slow');
        } else if (systemData.flow_status.includes("TẮC")) {
            flowStatus.classList.add('flow-clogged');
        }
    }
    
    // Cập nhật tốc độ nước
    const speed = systemData.water_speed || 0;
    waterSpeedValue.textContent = speed.toFixed(2) + ' cm/s';
}

function updateTankStatus() {
    const tankStatus = document.getElementById('tank-status');
    const tankWater = document.getElementById('tank-water');
    const tankLevel = document.getElementById('tank-level');
    const waterLevelValue = document.getElementById('water-level-value');
    const tankDistanceValue = document.getElementById('tank-distance-value');
    
    if (systemData.tank_full) {
        tankStatus.innerHTML = '<span class="status-indicator status-online"></span> BỒN ĐẦY';
        tankStatus.style.color = '#f44336';
        tankWater.style.height = '100%';
        tankLevel.textContent = '100%';
        waterLevelValue.textContent = TANK_HEIGHT + ' cm';
    } else {
        tankStatus.innerHTML = '<span class="status-indicator status-offline"></span> BỒN CHƯA ĐẦY';
        tankStatus.style.color = '#4caf50';
        
        // Tính mức nước thực tế
        // Cảm biến đo khoảng cách từ cảm biến đến mặt nước
        // Mức nước thực = Chiều cao bồn - Khoảng cách đo được
        const tankDistance = systemData.tank_distance_cm || 0;
        const waterLevel = Math.max(0, TANK_HEIGHT - tankDistance);
        const percentage = Math.min(100, Math.max(0, (waterLevel / TANK_HEIGHT) * 100));
        
        tankWater.style.height = percentage + '%';
        tankLevel.textContent = Math.round(percentage) + '%';
        waterLevelValue.textContent = waterLevel.toFixed(1) + ' cm';
        tankDistanceValue.textContent = tankDistance + ' cm';
    }
}

function updateConnectionStatus(status, message) {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');
    const loading = document.getElementById('connection-loading');
    
    loading.style.display = 'none';
    indicator.style.display = 'inline-block';
    
    switch(status) {
        case 'connecting':
            loading.style.display = 'inline-block';
            indicator.style.display = 'none';
            text.textContent = message;
            text.style.color = '#ff9800';
            break;
        case 'connected':
            indicator.className = 'status-indicator status-online';
            text.textContent = message;
            text.style.color = '#4caf50';
            break;
        case 'error':
            indicator.className = 'status-indicator status-offline';
            text.textContent = message;
            text.style.color = '#f44336';
            break;
        case 'disconnected':
            indicator.className = 'status-indicator status-offline';
            text.textContent = message;
            text.style.color = '#f44336';
            break;
    }
}

function sendCommand(command) {
    if (!isConnected || !mqttClient) {
        addLog("❌ Chưa kết nối MQTT, không thể gửi lệnh");
        return;
    }
    
    try {
        mqttClient.publish(TOPIC_COMMANDS, JSON.stringify({ command }));
        addLog("📤 Đã gửi lệnh: " + command);
    } catch (error) {
        console.error("Lỗi gửi lệnh:", error);
        addLog("❌ Lỗi gửi lệnh: " + error.message);
    }
}

function addLog(message) {
    const logsContainer = document.getElementById('logs-container');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('vi-VN');
    
    logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> ${message}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    // Giới hạn số lượng log
    if (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

// Khởi tạo sự kiện cho các nút
document.getElementById('valve-on').addEventListener('click', () => {
    sendCommand('valve_on');
});

document.getElementById('valve-off').addEventListener('click', () => {
    sendCommand('valve_off');
});

// Khởi động kết nối MQTT khi trang được tải
window.addEventListener('load', () => {
    addLog("🚀 Đang khởi động hệ thống...");
    connectMQTT();
});

// Dọn dẹp khi đóng trang
window.addEventListener('beforeunload', () => {
    if (mqttClient) {
        mqttClient.end();
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
});