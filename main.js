const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const os = require('os');

// 환경변수 로드 (개발/빌드 환경 모두 지원)
const isDev = !app.isPackaged;
if (isDev) {
  require('dotenv').config();
} else {
  require('dotenv').config({ path: path.join(process.resourcesPath, '.env') });
}

let mainWindow;
let db;

// MongoDB 연결 설정 (환경변수에서 로드)
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'commuteApp';

// 환경변수 검증
if (!MONGO_URI) {
  console.error('경고: MONGO_URI 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

// 기기 고유 ID 생성 (MAC 주소 + CPU ID 기반)
function generateDeviceId() {
  const networkInterfaces = os.networkInterfaces();
  let macAddress = '';

  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        macAddress = iface.mac;
        break;
      }
    }
    if (macAddress) break;
  }

  const cpuInfo = os.cpus()[0]?.model || 'unknown';
  const hostname = os.hostname();

  const combined = `${macAddress}-${cpuInfo}-${hostname}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
}

const DEVICE_ID = generateDeviceId();

// 입력 검증 유틸리티
function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>\"\'&]/g, '');
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

function isValidTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return true;
  const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(timeStr);
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('잘못된 레코드 형식');
  }
  if (!isValidDate(record.date)) {
    throw new Error('잘못된 날짜 형식');
  }
  if (!record.userName || typeof record.userName !== 'string') {
    throw new Error('사용자 이름이 필요합니다');
  }
  if (record.checkIn && !isValidTime(record.checkIn)) {
    throw new Error('잘못된 출근 시간 형식');
  }
  if (record.checkOut && !isValidTime(record.checkOut)) {
    throw new Error('잘못된 퇴근 시간 형식');
  }

  return {
    date: record.date,
    userName: sanitizeString(record.userName, 50),
    checkIn: record.checkIn || null,
    checkOut: record.checkOut || null,
    totalBreakMinutes: typeof record.totalBreakMinutes === 'number'
      ? Math.min(Math.max(0, record.totalBreakMinutes), 1440)
      : 0,
    breakStart: record.breakStart || null
  };
}

function validateFaceUser(user) {
  if (!user || typeof user !== 'object') {
    throw new Error('잘못된 사용자 형식');
  }
  if (!user.name || typeof user.name !== 'string') {
    throw new Error('사용자 이름이 필요합니다');
  }
  if (!Array.isArray(user.descriptors)) {
    throw new Error('얼굴 데이터가 필요합니다');
  }

  return {
    name: sanitizeString(user.name, 50),
    descriptors: user.descriptors,
    registeredAt: user.registeredAt || new Date().toISOString(),
    passwordHash: user.passwordHash || null,
    registeredDevices: user.registeredDevices || [],
    // 개인정보 동의 정보 저장
    privacyConsent: user.privacyConsent || {
      agreedAt: new Date().toISOString(),
      privacyPolicy: false,
      biometricData: false,
      dataRetention: false,
      retentionPeriod: 'until_resignation'
    }
  };
}

// 비밀번호 해시 생성 (간단한 SHA256 - bcrypt는 Admin에서만 사용)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// MongoDB 연결
async function connectDB() {
  if (!MONGO_URI) {
    console.error('MongoDB URI가 설정되지 않았습니다.');
    return false;
  }

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('MongoDB 연결 성공');
    return true;
  } catch (error) {
    console.error('MongoDB 연결 실패:', error.message);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize(); // 1920x1080 풀스크린으로 시작
}

// 출퇴근 데이터 로드
async function loadData() {
  try {
    const collection = db.collection('records');
    const records = await collection.find({}).sort({ date: -1, _id: -1 }).toArray();
    return { records };
  } catch (error) {
    console.error('데이터 로드 오류:', error.message);
    return { records: [] };
  }
}

// 출퇴근 데이터 저장 (단일 레코드 업서트)
async function saveRecord(record) {
  try {
    const validatedRecord = validateRecord(record);
    const collection = db.collection('records');
    await collection.updateOne(
      { date: validatedRecord.date, userName: validatedRecord.userName },
      { $set: validatedRecord },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('데이터 저장 오류:', error.message);
    return false;
  }
}

// 얼굴 데이터 로드
async function loadFaces() {
  try {
    const collection = db.collection('faces');
    const users = await collection.find({}).toArray();
    // 클라이언트에는 비밀번호 해시 제외하고 전송
    return {
      users: users.map(u => ({
        name: u.name,
        descriptors: u.descriptors,
        registeredAt: u.registeredAt,
        registeredDevices: u.registeredDevices || []
      }))
    };
  } catch (error) {
    console.error('얼굴 데이터 로드 오류:', error.message);
    return { users: [] };
  }
}

// 얼굴 데이터 저장 (단일 사용자 업서트) - 비밀번호 포함
async function saveFace(user) {
  try {
    const collection = db.collection('faces');
    const existingUser = await collection.findOne({ name: user.name });

    if (existingUser) {
      // 기존 사용자: 얼굴 디스크립터만 추가
      await collection.updateOne(
        { name: user.name },
        {
          $set: {
            descriptors: user.descriptors,
            registeredAt: user.registeredAt
          }
        }
      );
    } else {
      // 새 사용자: 비밀번호 해시 포함하여 저장
      const validatedUser = validateFaceUser(user);
      if (user.password) {
        validatedUser.passwordHash = hashPassword(user.password);
      }
      validatedUser.registeredDevices = [DEVICE_ID]; // 최초 등록 기기
      await collection.insertOne(validatedUser);
    }
    return true;
  } catch (error) {
    console.error('얼굴 데이터 저장 오류:', error.message);
    return false;
  }
}

// 기기 인증 확인
async function checkDeviceAuth(userName) {
  try {
    const collection = db.collection('faces');
    const user = await collection.findOne({ name: userName });

    if (!user) {
      return { success: false, error: 'user_not_found' };
    }

    const registeredDevices = user.registeredDevices || [];

    if (registeredDevices.includes(DEVICE_ID)) {
      return { success: true, authorized: true };
    } else {
      return { success: true, authorized: false, needPassword: true };
    }
  } catch (error) {
    console.error('기기 인증 오류:', error.message);
    return { success: false, error: 'db_error' };
  }
}

// 비밀번호로 기기 등록
async function verifyAndRegisterDevice(userName, password) {
  try {
    const collection = db.collection('faces');
    const user = await collection.findOne({ name: userName });

    if (!user) {
      return { success: false, message: '사용자를 찾을 수 없습니다.' };
    }

    if (!user.passwordHash) {
      return { success: false, message: '비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요.' };
    }

    const inputHash = hashPassword(password);
    if (inputHash !== user.passwordHash) {
      return { success: false, message: '비밀번호가 틀렸습니다.' };
    }

    // 비밀번호 확인 성공 → 기기 등록
    const registeredDevices = user.registeredDevices || [];
    if (!registeredDevices.includes(DEVICE_ID)) {
      registeredDevices.push(DEVICE_ID);
      await collection.updateOne(
        { name: userName },
        { $set: { registeredDevices: registeredDevices } }
      );
    }

    return { success: true, message: '기기가 등록되었습니다.' };
  } catch (error) {
    console.error('기기 등록 오류:', error.message);
    return { success: false, message: '오류가 발생했습니다.' };
  }
}

// 수동 비밀번호 인증 (카메라 없이)
async function verifyPasswordOnly(userName, password) {
  try {
    if (!db) {
      return { success: false, message: '데이터베이스 연결이 끊어졌습니다.' };
    }

    const collection = db.collection('faces');
    const user = await collection.findOne({ name: userName });

    if (!user) {
      return { success: false, message: '사용자를 찾을 수 없습니다.' };
    }

    if (!user.passwordHash) {
      return { success: false, message: '비밀번호가 설정되지 않았습니다.' };
    }

    const inputHash = hashPassword(password);
    if (inputHash !== user.passwordHash) {
      return { success: false, message: '비밀번호가 틀렸습니다.' };
    }

    return { success: true, message: '인증 성공', user: { name: user.name } };
  } catch (error) {
    console.error('비밀번호 인증 오류:', error.message);
    return { success: false, message: '인증 중 오류가 발생했습니다.' };
  }
}

// 긴급 출퇴근 기록 (감사 로그 포함)
async function saveEmergencyRecord(record, reason) {
  try {
    const validatedRecord = validateRecord(record);
    
    // 일반 기록 저장
    const collection = db.collection('records');
    await collection.updateOne(
      { date: validatedRecord.date, userName: validatedRecord.userName },
      { $set: validatedRecord },
      { upsert: true }
    );

    // 감사 로그 저장
    const auditCollection = db.collection('audit_logs');
    await auditCollection.insertOne({
      type: 'emergency_checkin',
      userName: validatedRecord.userName,
      action: record.checkIn ? 'emergency_check_in' : record.checkOut ? 'emergency_check_out' : 'emergency_break',
      reason: reason,
      deviceId: DEVICE_ID,
      timestamp: new Date(),
      needsApproval: true,
      approved: false
    });

    return { success: true, message: '긴급 기록이 저장되었습니다. 관리자 승인이 필요합니다.' };
  } catch (error) {
    console.error('긴급 기록 저장 오류:', error.message);
    return { success: false, message: '기록 저장에 실패했습니다.' };
  }
}

// 오프라인 기록 동기화
async function syncOfflineRecords(offlineRecords) {
  try {
    const results = [];
    
    for (const record of offlineRecords) {
      try {
        if (record.isEmergency) {
          const result = await saveEmergencyRecord(record, record.reason || 'offline_sync');
          results.push({ ...record, synced: result.success });
        } else {
          const success = await saveRecord(record);
          results.push({ ...record, synced: success });
        }
      } catch (error) {
        console.error('개별 기록 동기화 실패:', error);
        results.push({ ...record, synced: false, error: error.message });
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('오프라인 동기화 오류:', error.message);
    return { success: false, message: error.message };
  }
}

// 등록된 사용자 목록 가져오기
async function getRegisteredUsers() {
  try {
    if (!db) {
      return { success: false, users: [] };
    }

    const collection = db.collection('faces');
    const users = await collection.find({}, { projection: { name: 1, registeredAt: 1 } }).toArray();
    
    return { 
      success: true, 
      users: users.map(u => ({ 
        name: u.name, 
        registeredAt: u.registeredAt 
      }))
    };
  } catch (error) {
    console.error('사용자 목록 로드 오류:', error.message);
    return { success: false, users: [] };
  }
}

// IPC 핸들러
ipcMain.handle('load-data', async () => {
  return await loadData();
});

ipcMain.handle('save-record', async (event, record) => {
  return await saveRecord(record);
});

ipcMain.handle('get-today', () => {
  const now = new Date();
  return now.toISOString().split('T')[0];
});

ipcMain.handle('load-faces', async () => {
  return await loadFaces();
});

ipcMain.handle('save-face', async (event, user) => {
  return await saveFace(user);
});

ipcMain.handle('get-models-path', () => {
  return path.join(__dirname, 'models');
});

// DB 연결 상태 확인
ipcMain.handle('check-db-connection', () => {
  return db !== undefined;
});

// 기기 ID 가져오기
ipcMain.handle('get-device-id', () => {
  return DEVICE_ID;
});

// 기기 인증 확인
ipcMain.handle('check-device-auth', async (event, userName) => {
  return await checkDeviceAuth(userName);
});

// 비밀번호로 기기 등록
ipcMain.handle('verify-and-register-device', async (event, userName, password) => {
  return await verifyAndRegisterDevice(userName, password);
});

// 수동 비밀번호 인증
ipcMain.handle('verify-password-only', async (event, userName, password) => {
  return await verifyPasswordOnly(userName, password);
});

// 긴급 기록 저장
ipcMain.handle('save-emergency-record', async (event, record, reason) => {
  return await saveEmergencyRecord(record, reason);
});

// 오프라인 기록 동기화
ipcMain.handle('sync-offline-records', async (event, records) => {
  return await syncOfflineRecords(records);
});

// 등록된 사용자 목록
ipcMain.handle('get-registered-users', async () => {
  return await getRegisteredUsers();
});

// 네트워크 상태 확인
ipcMain.handle('check-network-status', async () => {
  try {
    // DB 연결 상태로 네트워크 상태 판단
    if (!db) {
      return { online: false, dbConnected: false };
    }
    
    // 간단한 DB 쿼리로 연결 테스트
    await db.admin().ping();
    return { online: true, dbConnected: true };
  } catch (error) {
    return { online: false, dbConnected: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  await connectDB();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
