export function render(css: string) {
    const jsx =
    <html>
        <head>
            <link rel="icon" href="data:," />
            <link rel="stylesheet" href={css} />
            <script type="module" defer>
                [SCRIPT]
            </script>
        </head>
        <body>
            
        </body>
    </html>;

    return jsx;
}

export default render;
