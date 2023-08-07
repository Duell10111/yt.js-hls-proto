import {Innertube, Misc, Player, YTNodes} from "youtubei.js"
import _ from "lodash";
import {getSegments} from "./segmentExtractor";

export type saveFile = (name: string, content: string) => Promise<void>

export async function saveHLSFile(hlsPlaylist: HLSStructure, saveFileFkt: saveFile) {
    await saveFileFkt("master.m3u8", hlsPlaylist.master)
    await Promise.all(Object.entries(hlsPlaylist.subFiles).map(value => {
        saveFileFkt(value[0], value[1])
    }))
    if(hlsPlaylist.expirationData) {
        await saveFileFkt("metadata.json", JSON.stringify({
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

export async function hlsTransform(videoId: string, innerTube?: Innertube) {
    const youtube = innerTube ?? await Innertube.create({});
    const videoInfo = await youtube.getInfo(videoId)

    const adaptiveFormats = videoInfo.streaming_data?.adaptive_formats?.filter(format => {
        return (format.mime_type.startsWith("video/mp4") || format.mime_type.startsWith("audio/mp4") )
    }) ?? []

    // console.log(JSON.stringify(adaptiveFormats, null, 2))

    const videoStreams = adaptiveFormats.filter(v => v.has_video)
    // Only keep biggest quality atm
    // const videoStreams = [_.chain(adaptiveFormats).filter(v => v.has_video).maxBy(value => value.bitrate).value()]
    const audioStreams = adaptiveFormats.filter(v => v.has_audio)

    const videoGroups = _.groupBy(videoStreams, value => value.mime_type)

    const videoKeys = Object.keys(videoGroups)

    // console.log(JSON.stringify(Object.keys(videoGroups)))

    const player = youtube.session.player

    const masterFile = [
        "#EXTM3U"
    ]
    const subFiles : {[key: string]: string} = {}

    // Chapters
    const chapters = _.chain(videoInfo.player_overlays?.decorated_player_bar?.player_bar?.markers_map ?? [])
        .flatMap(c => c.value.chapters).compact().value()
    if(chapters.length > 0) {
        subFiles["chapters.json"] = chapterExtractionJSON(chapters)
        masterFile.push(
            `#EXT-X-SESSION-DATA:DATA-ID="com.apple.hls.chapters",URI="chapters.json"`
        )
    } else {
        console.log("No Chapters available for : ", videoId)
    }

    const audioGroups = _.groupBy(audioStreams, value => value.language)

    const audioLanguages = Object.keys(audioGroups)

    let defaultAudioValue : string | undefined = undefined

    await Promise.all(audioLanguages.flatMap(key => {
        const formats = audioGroups[key]
        return formats.map(async f => {
            const subFileName = f.itag + ".m3u8";
            const audioHeader = generateAudioHeader(f, "audio", subFileName)
            subFiles[subFileName] = await generateSubFile([f], player)
            masterFile.push(audioHeader)
            defaultAudioValue = "audio"
        })
    }))

    await Promise.all(videoKeys.map(async key => {
        const formats = videoGroups[key]
        const header = generateHeader(formats[0], defaultAudioValue)
        if(!header) {
            console.warn("No Header generated for: ", JSON.stringify(formats, null, 4))
            return
        }
        const subFileName = "v-" + formats[0].itag  + ".m3u8"
        subFiles[subFileName] = await generateSubFile(formats, player)
        masterFile.push(...[header, subFileName])
    }))

    const masterPlaylist = masterFile.join("\n")

    return {
        master: masterPlaylist,
        subFiles: subFiles,
        expirationData: videoInfo.streaming_data?.expires
    } as HLSStructure
}

function generateAudioHeader(format: Misc.Format, groupID: string, uri: string, defaultAudio?: boolean) {
    const language = format.language ?? "en";
    return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${groupID}",LANGUAGE="${language}",NAME="${format.audio_quality}",AUTOSELECT=YES,DEFAULT=YES,URI="${uri}"`
}

function generateHeader(format: Misc.Format, audio?: string) {
    const codec = codecsExtraction(format.mime_type)
    const audioHeader = audio ? `,AUDIO="${audio}"` : ""
    if(format.has_video) {
        const fps = format.fps ? `,FRAME-RATE=${format.fps}` : ""
        const averageBandwidth = format.average_bitrate ? `,AVERAGE-BANDWIDTH=${format.average_bitrate}` : ""
        return `#EXT-X-STREAM-INF:BANDWIDTH=${format.bitrate}${averageBandwidth}${fps},RESOLUTION=${format.width}x${format.height},CODECS="${codec}"${audioHeader}`
    }
}

async function generateSubFile(format: Misc.Format[], player?: Player) {
    // console.log(JSON.stringify(format, null, 4))

    // TODO: Skip empty formats?

    const duration = _.maxBy(format, f => f.approx_duration_ms)?.approx_duration_ms

    const hlsStart = [
        "#EXTM3U",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        `#EXT-X-TARGETDURATION:${Math.ceil(duration ? duration / 1000 : 10)}`,
        "#EXT-X-VERSION:7",
        "#EXT-X-MEDIA-SEQUENCE:0"
    ]
    const xMaps: {[url: string]: string} = {}

    const formats = (await Promise.all(format.map(async f => {
        const url = f.decipher(player)

        const indexRange = f.index_range
        const intRange = f.init_range

        try {
            if(indexRange && intRange) {
                const segments = await getSegments(url, indexRange.end)
                // console.log("Segments: ", segments)

                // Int Range
                xMaps[f.itag] = `#EXT-X-MAP:URI="${url}",BYTERANGE="${intRange.end}@${intRange.start}"`

                return segments.flatMap(segment => {
                    return [
                        `#EXTINF:${segment.duration},`,
                        `#EXT-X-BYTERANGE:${segment.length}@${segment.start}`,
                        url
                    ]
                })
            }
        } catch (e) {
            console.error(e)
        }

        // Otherwise only return single segment
        console.log("Returning only single segment")

        return _.compact([
            `#EXTINF:${f.approx_duration_ms/1000},`,
            url
        ])
    }))).flat()

    hlsStart.push(...Object.values(xMaps))

    hlsStart.push(...formats)

    hlsStart.push("#EXT-X-ENDLIST")

    return hlsStart.join("\n")
}

function codecsExtraction(mimeType: string) {
    return mimeType.split('codecs="')[1].split('"')[0]
}

interface HLSChapter {
    chapter: number;
    "start-time": number;
    titles: {
        language: string;
        title: string;
    }[],
    images?: {
        "image-category": string,
        "pixel-width": number,
        "pixel-height": number,
        "url": string
    }[]
}

// Add all languages needed
const chapterLanguages = ["de", "en"]

function chapterExtractionJSON(chapters: YTNodes.Chapter[]) {
    const json = chapters.map((chapter, index) => {
        return {
            chapter: index,
            "start-time": chapter.time_range_start_millis / 1000,
            titles: chapterLanguages.map(languageCode => ({
                language: languageCode,
                title: chapter.title.text
            })),
            images: chapter.thumbnail.map(image => (
                {
                    "image-category": "hd",
                    "pixel-height": image.height,
                    "pixel-width": image.width,
                    url: image.url
                }
            ))
        } as HLSChapter
    })

    return JSON.stringify(json)
}

