##### Documation

###### How to use
example:
`node ./src/index.js --dir=PATH_TO_DIR --fontName=FONT_NAME --fontFamily=FONT_FAMILY`

this also returns something:
`node ./src/index.js --help`


##### Add to Bash/ZSH Profile
to run this program you can add this to your zsh rc or bash rc 
remember to replace "BASE_PATH" with the path you have this github repo downloaded at
`alias makeFontFromPDF="node BASE_PATH/mel-font/src/index.js --dir=$(pwd) --fontName=\$1 --fontFamily=\$2"`