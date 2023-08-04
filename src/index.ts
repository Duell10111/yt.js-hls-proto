import express, {Express} from 'express';
import * as fs from "fs";
import path from "path";
import {deleteExpiringFiles, FileStorage, getHLSFile} from "./hlsStorage";

const app: Express = express();
const port = process.env.PORT ?? 7500;

app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

const mimeTypeHLS = "application/vnd.apple.mpegURL"

app.get("/video/:id/:path", async (req, res) => {
    const videoId = req.params.id
    const path = req.params.path
    try {
        const data = await getHLSFile(videoId, path, fileStorage)
        res.set('Content-Type', mimeTypeHLS);
        res.send(data)
    } catch (e) {
        console.error(e)
        res.sendStatus(500)
    }

})

app.get("/cleanup", async (req, res) => {
    try {
        await deleteExpiringFiles(fileStorage)
        res.sendStatus(200)
    } catch (e) {
        console.error("Error in cleanup-fkt: ",e)
        res.sendStatus(500)
    }
})

const saveFileLocally = async (videoId: string, name: string, content: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId + "/" + name)
    const dirPath = path.dirname(filePath)
    if(!fs.existsSync(dirPath)) {
        fs.mkdir(dirPath, {recursive: true}, console.error)
    }
    fs.writeFile(filePath, content, console.error)
}

const getFileLocally = async (videoId: string, name: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId + "/" + name)
    if(fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, {}).toString()
    }
}

const deleteFolder = async (videoId: string) => {
    const filePath = path.join(__dirname, "/../playlists/" + videoId)
    if(fs.existsSync(filePath)) {
        fs.rmSync(filePath, {recursive: true, force: true})
    }
}

const getAllVideoIds = async () => {
    const filePath = path.join(__dirname, "/../playlists")
    return fs.readdirSync(filePath).filter(function (file) {
        return fs.statSync(filePath + '/' + file).isDirectory();
    });
}

const fileStorage = {
    getFileLocally,
    deleteFolder,
    saveFileLocally,
    getAllVideoIds
} as FileStorage

// getHLSFile("Wc_iD5Nj-I0", "master.m3u8", {
//     getFileLocally,
//     deleteFolder,
//     saveFileLocally
// }).catch(console.warn)
