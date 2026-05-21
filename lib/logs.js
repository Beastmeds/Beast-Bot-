let stdouts = []
let isModified = false

export default (maxLength = 200) => {
  let oldWrite = process.stdout.write.bind(process.stdout)
  isModified = true
  process.stdout.write = (chunk, encoding, callback) => {
    stdouts.push(Buffer.from(chunk, encoding))
    oldWrite(chunk, encoding, callback)
    if (stdouts.length > maxLength) stdouts.shift()
  }
  return { isModified, disable: () => { isModified = false; process.stdout.write = oldWrite } }
}

export { isModified }
export function logs() { return Buffer.concat(stdouts)}