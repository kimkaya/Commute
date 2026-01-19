const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { MongoClient } = require('mongodb');

let mainWindow;
let db;

// MongoDB 연결 설정
const MONGO_URI = 'mongodb+srv://andy_db:0000@andy.pkd4ass.mongodb.net/?retryWrites=true&w=majority&appName=andy';
const DB_NAME = 'commuteApp';

// MongoDB 연결
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('MongoDB 연결 성공');
    return true;
  } catch (error) {
    console.error('MongoDB 연결 실패:', error);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 1000,
    minWidth: 700,
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
}

// 출퇴근 데이터 로드
async function loadData() {
  try {
    const collection = db.collection('records');
    const records = await collection.find({}).sort({ date: -1, _id: -1 }).toArray();
    return { records };
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    return { records: [] };
  }
}

// 출퇴근 데이터 저장 (단일 레코드 업서트)
async function saveRecord(record) {
  try {
    const collection = db.collection('records');
    await collection.updateOne(
      { date: record.date, userName: record.userName },
      { $set: record },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('데이터 저장 오류:', error);
    return false;
  }
}

// 얼굴 데이터 로드
async function loadFaces() {
  try {
    const collection = db.collection('faces');
    const users = await collection.find({}).toArray();
    return { users };
  } catch (error) {
    console.error('얼굴 데이터 로드 오류:', error);
    return { users: [] };
  }
}

// 얼굴 데이터 저장 (단일 사용자 업서트)
async function saveFace(user) {
  try {
    const collection = db.collection('faces');
    await collection.updateOne(
      { name: user.name },
      { $set: user },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('얼굴 데이터 저장 오류:', error);
    return false;
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
