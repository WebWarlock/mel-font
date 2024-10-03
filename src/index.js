#!/usr/bin/env node
import { Poppler } from 'node-poppler';
import potrace from 'potrace';
import { readdirSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { join, basename, extname } from 'path'
import parseArgs from 'args-parser'
import { createCanvas, loadImage } from 'canvas'
import opentype from 'opentype.js'

const sleep = timeout => new Promise((resolve) => setTimeout(resolve, timeout));

function parsePath(pathString) {
    const commands = pathString.match(/[a-df-zA-DF-Z][^a-df-zA-DF-Z]*/g); // Split the path string into commands
    const result = [];
    let currentPosition = { x: 0, y: 0 };

    // Helper function to parse coordinate pairs
    function parseCoords(str) {
        return str.trim().split(/[\s,]+/).map(Number);
    }

    commands.forEach(command => {
        const type = command[0];
        const coords = parseCoords(command.slice(1));

        switch (type) {
            case 'M': { // MoveTo (absolute)
                for (let i = 0; i < coords.length; i += 2) {
                    result.push(['moveTo', coords[i], coords[i + 1]]);
                    currentPosition.x = coords[i];
                    currentPosition.y = coords[i + 1];
                }
                break;
            }
            case 'm': { // MoveTo (relative)
                for (let i = 0; i < coords.length; i += 2) {
                    currentPosition.x += coords[i];
                    currentPosition.y += coords[i + 1];
                    result.push(['moveTo', currentPosition.x, currentPosition.y]);
                }
                break;
            }
            case 'L': { // LineTo (absolute)
                for (let i = 0; i < coords.length; i += 2) {
                    result.push(['lineTo', coords[i], coords[i + 1]]);
                    currentPosition.x = coords[i];
                    currentPosition.y = coords[i + 1];
                }
                break;
            }
            case 'l': { // LineTo (relative)
                for (let i = 0; i < coords.length; i += 2) {
                    currentPosition.x += coords[i];
                    currentPosition.y += coords[i + 1];
                    result.push(['lineTo', currentPosition.x, currentPosition.y]);
                }
                break;
            }
            case 'C': { // Cubic Bezier Curve (absolute)
                for (let i = 0; i < coords.length; i += 6) {
                    result.push([
                        'cubicCurveTo',
                        coords[i], coords[i + 1],   // Control point 1
                        coords[i + 2], coords[i + 3], // Control point 2
                        coords[i + 4], coords[i + 5]  // End point
                    ]);
                    currentPosition.x = coords[i + 4];
                    currentPosition.y = coords[i + 5];
                }
                break;
            }
            case 'c': { // Cubic Bezier Curve (relative)
                for (let i = 0; i < coords.length; i += 6) {
                    result.push([
                        'cubicCurveTo',
                        currentPosition.x + coords[i], currentPosition.y + coords[i + 1],
                        currentPosition.x + coords[i + 2], currentPosition.y + coords[i + 3],
                        currentPosition.x + coords[i + 4], currentPosition.y + coords[i + 5]
                    ]);
                    currentPosition.x += coords[i + 4];
                    currentPosition.y += coords[i + 5];
                }
                break;
            }
            case 'Q': { // Quadratic Bezier Curve (absolute)
                for (let i = 0; i < coords.length; i += 4) {
                    result.push([
                        'quadCurveTo',
                        coords[i], coords[i + 1],   // Control point
                        coords[i + 2], coords[i + 3]  // End point
                    ]);
                    currentPosition.x = coords[i + 2];
                    currentPosition.y = coords[i + 3];
                }
                break;
            }
            case 'q': { // Quadratic Bezier Curve (relative)
                for (let i = 0; i < coords.length; i += 4) {
                    result.push([
                        'quadCurveTo',
                        currentPosition.x + coords[i], currentPosition.y + coords[i + 1],
                        currentPosition.x + coords[i + 2], currentPosition.y + coords[i + 3]
                    ]);
                    currentPosition.x += coords[i + 2];
                    currentPosition.y += coords[i + 3];
                }
                break;
            }
            case 'Z':
            case 'z': { // Close path
                result.push(['closePath']);
                break;
            }
        }
    });

    return result;
}

opentype.Path.prototype.fromSvg = function (pathString) {
    const commands = parsePath(pathString);
    commands.forEach(([command, ...args]) => {
        switch (command) {
            case 'moveTo':
                this.moveTo(...args);
                break;
            case 'lineTo':
                this.lineTo(...args);
                break;
            case 'cubicCurveTo':
                this.curveTo(...args);
                break;
            case 'quadCurveTo':
                this.quadraticCurveTo(...args);
                break;
            case 'closePath':
                this.closePath();
                break;
        }
    });
}


const programArgs = parseArgs(process.argv)

const poppler = new Poppler()

const cwd = process.cwd()

const traceImage = img => {
    return new Promise((resolve, reject) => {
        potrace.trace(img, { threshold: 128 }, (err, svg) => {    
            if (err) reject(err)
            resolve(svg)
        })
    })
}

// var a = new of.Glyph({
//     familyName: 'fontFamily',
//     styleName: 'Regular',
//     unitsPerEm: 1000,
//     ascender: 800,
//     descender: -200,
// })

const processDirectory = async (dirPath, options = {}) => {
    let { fontName, fontFamily } = options 
    // Create a new font
    const notdefGlyph = new opentype.Glyph({
        name: '.notdef',
        advanceWidth: 512,
        path: new opentype.Path()
    });
    
    var glyphs = [notdefGlyph]
    let contents = readdirSync(dirPath);
    let pdfs = contents.filter(f => extname(f) == '.pdf')
    let letters = pdfs.map(f => basename(f).replace(extname(f), ''))
    if (!existsSync(dirPath, '/pngs/')) mkdirSync(join(dirPath, '/pngs'))
    let canvas = createCanvas(512, 512)
    let ctx = canvas.getContext('2d')
    for (let i = 0; i < pdfs.length; i++) {
        let letter = letters[i]
        let pdfFileName = pdfs[i]
        let pdfPath = join(dirPath, pdfFileName)

        let imagePath = join(dirPath, '/pngs', letter + '.png')
        
        await poppler.pdfToCairo(pdfPath, imagePath, {
        
            // jpegFile: true,
            // jpegOptions: 'quality=100,progressive=y,optimize=y',
            // scalePageTo: 300,
            // singleFile: true
            pngFile: true

            // jpegFile: true,
        })
        await sleep(200)
        renameSync(join(dirPath, '/pngs', letter + '.png-1.png'), imagePath)

        let png = await loadImage(imagePath)
        // ctx.drawImage(png, 0, 0)
        // let imageData = ctx.getImageData(0, 0, 512, 512)
        let svg = await traceImage(imagePath)
        console.log(svg)
        let pathString = svg?.match?.(/<path d="(?<pathString>.+?)"/)?.groups?.pathString
        console.log(pathString)
        const path = new opentype.Path();
        path.fromSvg(pathString)
        const glyph = new opentype.Glyph({
            name: letter,
            unicode: letter.charCodeAt(0),
            advanceWidth: 512,
            leftSideBearing: 0,
            path,
        })
        glyphs.push(glyph)
    }
    const font = new opentype.Font({
        familyName: fontFamily,
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs
    });
    console.log(font, font.prototype)

    writeFileSync(
        join(dirPath, fontName + '.ttf'), 
        Buffer.from(font.toArrayBuffer())
    );

    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Glyphs from ${fontName}</title>
      <style>
        @font-face {
          font-family: '${fontName}';
          src: url('${fontName}.ttf');
        }
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        .glyph {
          display: inline-block;
          text-align: center;
          margin: 10px;
          padding: 10px;
          border: 1px solid #ccc;
          width: 100px;
        }
        .glyph-char {
          font-family: '${fontName}', sans-serif;
          font-size: 48px;
        }
      </style>
    </head>
    <body>
      <h1>Glyphs from ${fontName}</h1>
      <div class="glyphs">
  `;

  // Loop through all glyphs in the font and display them
  glyphs.forEach((glyph, index) => {
    const unicode = glyph.unicode ? String.fromCharCode(glyph.unicode) : '';
    htmlContent += `
      <div class="glyph">
        <div class="glyph-char">${unicode}</div>
        <div class="glyph-code">${glyph.unicode ? 'U+' + glyph.unicode.toString(16).toUpperCase() : 'N/A'} (${String.fromCharCode(glyph.unicode)})</div>
      </div>
    `;
  });

  // Close the HTML tags
  htmlContent += `</div>
    </body>
    </html>`;

  // Write the HTML content to a file
  const outputFilePath = join(dirPath, `${fontName}-glyphs.html`);
  writeFileSync(outputFilePath, htmlContent);
}

const start = () => {
    if (programArgs.help) {
        console.log(`OK MEL I'LL HELP YOU
            examples: 
            create a font with the deault name
            npm run start -- --dir=pdfs

            create a font with custom name
            npm run start -- --dir=pdfs --fontName=INSERT_NAME_OF_FONT_HERE --fontFamily=INSERT_NAME_OF_FONT_FAMILY_HERE 


            `)
        return 
    }
    console.log(programArgs)
    let dirPath = join(cwd, programArgs.dir)
    console.log(dirPath)
    // Define the font metadata
    let fontName = "CustomFont";
    let fontFamily = "CustomFontFamily";
    processDirectory(dirPath, {
        fontName: programArgs.fontName ?? fontName,
        fontFamily: programArgs.fontFamily ?? fontFamily,
    })
    
}

start()