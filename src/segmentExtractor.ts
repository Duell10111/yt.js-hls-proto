import fetch from "node-fetch-commonjs";

const MP4Box = require("mp4box")

interface SegmentInfo {
    start: number
    length: number
    duration: number
}

interface SIDXReferences {
    referenced_size: number
    subsegment_duration: number
    // Other not added atm
}

export async function getSegments(url: string, indexEnd: number) {
    const file = MP4Box.createFile()

    const res = await fetch(url, {
        method: "GET",
        headers: {
            'Range': `bytes=0-${indexEnd}` // Maximum number of bytes to download
        }
    })
    if(res.ok) {
        console.log("StatusCode Segmentsrequest: " + res.statusText)
        const arrayBuffer = await res.arrayBuffer()
        const ab = (arrayBuffer as any) // To define a new property for mp4box
        ab.fileStart = 0;
        file.appendBuffer(arrayBuffer);
        // console.log(JSON.stringify(file, null, 4))

        const sidxTimescale : number = file["sidx"]["timescale"]
        const sidxSection : SIDXReferences[] = file["sidx"]["references"]
        console.log("Timescale: ", sidxTimescale)
        // console.log(JSON.stringify(sidxSection, null, 4))

        let currentStartPoint = indexEnd

        return sidxSection.map(ref => {
            const endSegment = currentStartPoint + ref.referenced_size

            const info = {
                start: currentStartPoint,
                length: ref.referenced_size,
                duration: ref.subsegment_duration / sidxTimescale
            } as SegmentInfo

            currentStartPoint = endSegment

            return info
        })
    } else {
        console.log(res.status)
    }

    return []
}
