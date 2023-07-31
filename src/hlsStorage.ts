import {hlsTransform, saveHLSFile} from "./hlsTransform";

export type getFileLocally = (videoId: string, filePath: string) => string | undefined
export type saveFileLocally = (videoId: string, filePath: string, content: string) => void
export type deleteFolder = (videoId: string) => void

export interface FileStorage {
    getFileLocally: getFileLocally,
    saveFileLocally: saveFileLocally,
    deleteFolder: deleteFolder
}

export async function getHLSFile(videoId: string, path: string, {getFileLocally, saveFileLocally, deleteFolder}: FileStorage) {
    const metadata  = getFileLocally(videoId, "metadata.json")
    const expires = metadata ? JSON.parse(metadata) as {expires: number} : undefined
    if(expires && expires.expires > Date.now()) {
        console.log("Trying to get local cache")
        const data = getFileLocally(videoId, path)
        if(data){
            return data
        }
    } else {
        console.log("Deleting old data...")
        deleteFolder(videoId)
    }

    try {
        const hlsData = await hlsTransform(videoId)
        saveHLSFile(hlsData, (name, content) => saveFileLocally(videoId, name, content))

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
