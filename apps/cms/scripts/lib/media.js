// Image helpers for the scripts that boot Strapi on a throwaway database.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const png = (width, height, [r, g, b]) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const frame = Buffer.alloc(4);
    frame.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([frame, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = zlib.deflateSync(Buffer.concat(Array(height).fill(row)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
};

// Uploads a solid-colour image through the upload plugin and returns the stored file. It lands in the
// media bucket, so the caller removes what it uploaded when it is done.
const uploadImage = async (strapi, key, { color = [200, 200, 200], width = 1200, height = 800, alternativeText } = {}) => {
  const filepath = path.join(os.tmpdir(), `eaves-${process.pid}-${key}.png`);
  const buffer = png(width, height, color);
  fs.writeFileSync(filepath, buffer);
  try {
    const fileInfo = { name: `${key}.png`, ...(alternativeText ? { alternativeText } : {}) };
    const [file] = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo },
      files: { filepath, originalFilename: `${key}.png`, mimetype: 'image/png', size: buffer.length },
    });
    return file;
  } finally {
    fs.rmSync(filepath, { force: true });
  }
};

// Uploads a file from the repository. The upload plugin is handed a copy, so the versioned original is never removed.
const uploadFile = async (strapi, sourcePath, alternativeText) => {
  const name = path.basename(sourcePath);
  const filepath = path.join(os.tmpdir(), `eaves-${process.pid}-${name}`);
  fs.copyFileSync(sourcePath, filepath);
  try {
    const [file] = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo: { name, alternativeText } },
      files: { filepath, originalFilename: name, mimetype: 'image/jpeg', size: fs.statSync(filepath).size },
    });
    return file;
  } finally {
    fs.rmSync(filepath, { force: true });
  }
};

const removeFiles = async (strapi, files) => {
  for (const file of files) {
    try {
      await strapi.plugin('upload').service('upload').remove(file);
    } catch (error) {
      console.error(`Could not remove uploaded file ${file.name}:`, error.message);
    }
  }
};

module.exports = { png, uploadFile, uploadImage, removeFiles };
