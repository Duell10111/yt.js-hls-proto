import express, { Express } from 'express';
import * as fs from "fs";
import path from "path";
import {getHLSFile} from "./hlsStorage";

// const dataDir = path.join(__dirname, "/../playlists/")
//

// function deleteFolder(dataDir: string) {
//     if(fs.existsSync(dataDir)){
//         fs.readdir(dataDir, (err, files) => {
//             if (err) throw err;
//
//             for (const file of files) {
//                 fs.unlink(path.join(dataDir, file), (err) => {
//                     if (err) throw err;
//                 });
//             }
//         });
//     }
// }


const app: Express = express();
const port = process.env.PORT ?? 5000;

app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

const mimeTypeHLS = "application/vnd.apple.mpegURL"

app.get("/video/:id/:path", async (req, res, next) => {
    const videoId = req.params.id
    const path = req.params.path
    try {
        const data = await getHLSFile(videoId, path, {
            getFileLocally,
            deleteFolder,
            saveFileLocally
        })
        res.set('Content-Type', mimeTypeHLS);
        res.send(data)
    } catch (e) {
        console.error(e)
        res.sendStatus(500)
    }

})

// const videoId = req.params.id
// const path = req.params.path
// const metadata  = getFileLocally(videoId, "metadata.json")
// const expires = metadata ? JSON.parse(metadata) as {expires: number} : undefined
// if(expires && expires.expires > Date.now()) {
//     console.log("Trying to get local cache")
//     const data = getFileLocally(videoId, path)
//     if(data){
//         console.log("Returning cached data")
//         res.set('Content-Type', mimeTypeHLS);
//         res.send(data)
//         return
//     }
// } else {
//     console.log("Deleting old data...")
//     deleteFolder(videoId)
// }
//
// try {
//     const hlsData = await hlsTransform(videoId)
//     saveHLSFile(hlsData, (name, content) => saveFileLocally(videoId, name, content))
// } catch (e) {
//     console.error("Error while fetching hlsData: ", e)
//     res.sendStatus(500)
//     return
// }
//
// const data = getFileLocally(videoId, path)
// if(data){
//     res.set('Content-Type', mimeTypeHLS);
//     res.send(data)
//     return
// } else {
//     res.sendStatus(404)
// }

const saveFileLocally = (videoId: string, name: string, content: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId + "/" + name)
    const dirPath = path.dirname(filePath)
    if(!fs.existsSync(dirPath)) {
        fs.mkdir(dirPath, {recursive: true}, console.error)
    }
    fs.writeFile(filePath, content, console.error)
}

const getFileLocally = (videoId: string, name: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId + "/" + name)
    if(fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, {}).toString()
    }
}

const deleteFolder = (videoId: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId)
    if(fs.existsSync(filePath)) {
        fs.rmSync(filePath, {recursive: true, force: true})
    }
}
