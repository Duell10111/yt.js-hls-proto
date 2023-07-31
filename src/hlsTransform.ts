import {Innertube, Player} from "youtubei.js"
import {Format} from "youtubei.js/dist/src/parser/misc";
import _ from "lodash";

export type saveFile = (name: string, content: string) => void

export function saveHLSFile(hlsPlaylist: HLSStructure, saveFileFkt: saveFile) {
    saveFileFkt("master.m3u8", hlsPlaylist.master)
    Object.entries(hlsPlaylist.subFiles).map(value => {
        saveFileFkt(value[0] + ".m3u8", value[1])
    })
    if(hlsPlaylist.expirationData) {
        saveFileFkt("metadata.json", JSON.stringify({
            expires: hlsPlaylist.expirationData?.getTime()
        }))
    }
}

export interface HLSStructure {
    master: string;
    subFiles: {
        [key: string]: string;
    },
    expirationData?: Date;
}

export async function hlsTransform(videoId: string) {
    const youtube = await Innertube.create({ /* setup - see above */ });
    const videoInfo = await youtube.getInfo(videoId)

    const adaptiveFormats = videoInfo.streaming_data?.adaptive_formats?.filter(format => {
        return (format.mime_type.startsWith("video/mp4") || format.mime_type.startsWith("audio/mp4") )
    }) ?? []

    console.log(JSON.stringify(adaptiveFormats, null, 2))

    // return {
    //     master: "",
    //     subFiles: {}
    // }

    // const videoStreams = adaptiveFormats.filter(v => v.has_video)
    // Only keep biggest quality atm
    const videoStreams = [_.chain(adaptiveFormats).filter(v => v.has_video).maxBy(value => value.bitrate).value()]
    const audioStreams = adaptiveFormats.filter(v => v.has_audio)

    const videoGroups = _.groupBy(videoStreams, value => value.mime_type)

    const videoKeys = Object.keys(videoGroups)

    console.log(JSON.stringify(Object.keys(videoGroups)))

    const player = youtube.session.player

    const masterFile = [
        "#EXTM3U"
    ]
    const subFiles : {[key: string]: string} = {}

    const audioGroups = _.groupBy(audioStreams, value => value.language)

    const audioLanguages = Object.keys(audioGroups)

    let defaultAudioValue : string | undefined = undefined

    audioLanguages.forEach(key => {
        const formats = audioGroups[key]
        formats.map(f => {
            const subFileName = f.itag;
            const audioHeader = generateAudioHeader(f, "audio", subFileName + ".m3u8")
            subFiles[subFileName] = generateSubFile([f], player)
            masterFile.push(audioHeader)
            defaultAudioValue = "audio"
        })
    })

    videoKeys.forEach(key => {
        const formats = videoGroups[key]
        const header = generateHeader(formats[0], defaultAudioValue)
        if(!header) {
            console.warn("No Header generated for: ", JSON.stringify(formats, null, 4))
            return
        }
        masterFile.push(header)
        const subFileName = "v-" + formats[0].itag
        subFiles[subFileName] = generateSubFile(formats, player)
        masterFile.push(subFileName + ".m3u8")
    })

    const masterPlaylist = masterFile.join("\n")

    return {
        master: masterPlaylist,
        subFiles: subFiles,
        expirationData: videoInfo.streaming_data?.expires
    } as HLSStructure
}

function generateAudioHeader(format: Format, groupID: string, uri: string, defaultAudio?: boolean) {
    return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${groupID}",LANGUAGE="en",NAME="${format.audio_quality}",AUTOSELECT=YES, DEFAULT=YES,URI="${uri}"`
}

function generateHeader(format: Format, audio?: string) {
    const codec = codecsExtraction(format.mime_type)
    const audioHeader = audio ? `,AUDIO="${audio}"` : ""
    if(format.has_video) {
        const fps = format.fps ? `,FRAME-RATE=${format.fps}` : ""
        const averageBandwidth = format.average_bitrate ? `,AVERAGE-BANDWIDTH=${format.average_bitrate}` : ""
        return `#EXT-X-STREAM-INF:BANDWIDTH=${format.bitrate}${averageBandwidth}${fps},RESOLUTION=${format.width}x${format.height},CODECS="${codec}"${audioHeader}`
    }
}

function generateSubFile(format: Format[], player?: Player) {
    console.log(JSON.stringify(format, null, 4))

    const duration = _.maxBy(format, f => f.approx_duration_ms)?.approx_duration_ms

    const hlsStart = [
        "#EXTM3U",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        `#EXT-X-TARGETDURATION:${Math.ceil(duration ? duration / 1000 : 10)}`,
        "#EXT-X-VERSION:4",
        "#EXT-X-MEDIA-SEQUENCE:0"
    ]

    const formats = format.flatMap(f => {
        return [
            `#EXTINF:${f.approx_duration_ms/1000},`,
            f.decipher(player)
        ]
    })
    hlsStart.push(...formats)

    hlsStart.push("#EXT-X-ENDLIST")

    const playlist = hlsStart.join("\n")

    console.log(playlist)

    return playlist
}

function codecsExtraction(mimeType: string) {
    return mimeType.split('codecs="')[1].split('"')[0]
}

