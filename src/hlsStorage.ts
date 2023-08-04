import {Innertube} from "youtubei.js"
import {hlsTransform, saveHLSFile} from "./hlsTransform";

export type getFileLocally = (videoId: string, filePath: string) => Promise<string | undefined>
export type saveFileLocally = (videoId: string, filePath: string, content: string) => Promise<void>
export type deleteFolder = (videoId: string) => Promise<void>
export type getAllVideoIds = () => Promise<string[]>

export interface FileStorage {
    getFileLocally: getFileLocally,
    saveFileLocally: saveFileLocally,
    deleteFolder: deleteFolder,
    getAllVideoIds: getAllVideoIds
}

export interface FileMetadata {
    expires: number
}

export async function getHLSFile(videoId: string, path: string, {getFileLocally, saveFileLocally, deleteFolder}: FileStorage, innerTube?: Innertube) {
    const metadata= await getFileLocally(videoId, "metadata.json")
    const expires = metadata ? JSON.parse(metadata) as FileMetadata : undefined
    if(expires && expires.expires > Date.now() - 1800000) { // 30 minutes before expiration
        console.log("Trying to get local cache")
        const data = await getFileLocally(videoId, path)
        if(data){
            return data
        }
    } else {
        console.log("Deleting old data...")
        await deleteFolder(videoId)
    }

    try {
        const hlsData = await hlsTransform(videoId, innerTube)
        await saveHLSFile(hlsData, async (name, content) => await saveFileLocally(videoId, name, content))

        if(path === "master.m3u8") {
            return hlsData.master
        } else {
            return hlsData.subFiles[path.slice(0, -5)] // Remove .m3u8
        }
    } catch (e) {
        console.error("Error while fetching hlsData: ", e)
        throw e
    }
}

export async function deleteExpiringFiles(fileStorage: FileStorage) {
    const ids = await fileStorage.getAllVideoIds()

    const promises = ids.map(async videoId => {
        const metadata= await fileStorage.getFileLocally(videoId, "metadata.json")
        const expires = metadata ? JSON.parse(metadata) as FileMetadata : undefined
        if(expires && expires.expires < Date.now() - 1800000) { // 30 minutes before expiration
            await fileStorage.deleteFolder(videoId)
        } else {
            console.log("Skipping video with id: ", videoId)
        }
    })
    await Promise.all(promises)
}
