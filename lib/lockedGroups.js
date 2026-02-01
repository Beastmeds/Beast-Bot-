// lib/lockedGroups.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const lockedGroupsFile = path.join(dataDir, 'lockedGroups.json');

function loadLockedGroups() {
  if (!fs.existsSync(lockedGroupsFile)) {
    fs.writeFileSync(lockedGroupsFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(lockedGroupsFile, 'utf-8'));
}

function saveLockedGroups(groups) {
  fs.writeFileSync(lockedGroupsFile, JSON.stringify(groups, null, 2), 'utf-8');
}

function isGroupLocked(groupId) {
  const locked = loadLockedGroups();
  return locked.includes(groupId);
}

function lockGroup(groupId) {
  const locked = loadLockedGroups();
  if (!locked.includes(groupId)) {
    locked.push(groupId);
    saveLockedGroups(locked);
  }
}

function unlockGroup(groupId) {
  let locked = loadLockedGroups();
  locked = locked.filter(g => g !== groupId);
  saveLockedGroups(locked);
}

module.exports = { isGroupLocked, lockGroup, unlockGroup };
