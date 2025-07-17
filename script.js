document.addEventListener("DOMContentLoaded", () => {

    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    // Fabric Drawing Board
    window.canvas = new fabric.Canvas('myCanvas', {
        selection: true,
        preserveObjectStacking: true
    });
    const canvas = window.canvas;

    // Pan Mode
    let lastPosX = 0;
    let lastPosY = 0;
    let panModeActive = false;

    // Arrow Tool
    let isArrowToolActive = false;
    let arrowLine = null;
    let arrowHead = null;

    // Zoom Mode
    let zoomLevel = 1;
    const ZOOM_STEP = 0.1;
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 3;

    // Scale Calibration
    let scaleFactor = null; // mm per pixel, set after calibration
    let isCalibrating = false;
    let calibrationPoints = [];
    let calibrationDots = [];



    // Tool Buttons
    const pdfUploadBtn = document.getElementById('pdf-upload');
    const panModeBtn = document.getElementById("panModeBtn");
    const freeHandDrawingBtn = document.getElementById("freeHandDrawing");
    const setLineToolClickModeBtn = document.getElementById("setLineToolClickMode");
    // const setArcToolBtn = document.getElementById("setArcToolBtn");
    const setAngleLinesToolBtn = document.getElementById("setAngleLinesTool");
    const setScaleCalibrationToolBtn = document.getElementById("setScaleCalibrationTool");
    const setEraserBtn = document.getElementById("setEraser");
    const addRectBtn = document.getElementById("addRect");
    const addCircleBtn = document.getElementById("addCircle");
    const addTextBtn = document.getElementById("addText");
    const addArrowBtn = document.getElementById("setArrow");
    const clearCanvasBtn = document.getElementById("clearCanvas");
    const undoCanvasBtn = document.getElementById("undoCanvas");
    const redoCanvasBtn = document.getElementById("redoCanvas");
    const exportPDFBtn = document.getElementById("exportPDF");
    const eraserCursorBtn = document.getElementById('eraser-cursor');
    const pdfRemoveBtn = document.querySelector('button.pdf-remove-btn');
    const uploadWrapperBtns = document.querySelector('div.upload-wrapper-btns');
    const container = document.getElementById('pdf-container');
    const toolBar = document.getElementById('toolbar');
    // const measureInput = document.getElementById('measure-input');


    // const startCalibrationModeBtn = document.getElementById('startCalibrationMode');

    let uploadedPDFName = '';
    let canvasHistory = [];
    let historyStep = -1;

    function saveHistory() {
        historyStep++;
        canvasHistory = canvasHistory.slice(0, historyStep);
        canvasHistory.push(JSON.stringify(canvas));
    }

    function undo() {
        if (historyStep > 0) {
            historyStep--;
            canvas.loadFromJSON(canvasHistory[historyStep], () => {
                canvas.renderAll();
            });
        }
    }

    function redo() {
        if (historyStep < canvasHistory.length - 1) {
            historyStep++;
            canvas.loadFromJSON(canvasHistory[historyStep], () => {
                canvas.renderAll();
            });
        }
    }

    function clearCanvasHistory() {
        canvasHistory = [];
        historyStep = -1;
    }

    // PDf uplaod
    async function pdfUpload(event) {
        clearCanvasHistory();
        resetZoom();
        resetPan();
        clearCanvas();

        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('file-name').textContent = file.name;
        uploadedPDFName = file.name;

        canvas.selection = true;

        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdfDoc.getPage(1);

        const originalViewport = page.getViewport({ scale: 1 });
        const pdfWidth = originalViewport.width;
        const pdfHeight = originalViewport.height;

        const maxWidth = window.innerWidth * 0.9;
        const maxHeight = window.innerHeight * 0.85;

        const scaleX = maxWidth / pdfWidth;
        const scaleY = maxHeight / pdfHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledViewport = page.getViewport({ scale });
        const scaledWidth = scaledViewport.width;
        const scaledHeight = scaledViewport.height;

        const container = document.getElementById('pdf-container');
        const wrapper = document.getElementById('canvas-wrapper');

        container.style.display = 'block';
        container.style.width = `${scaledWidth}px`;
        container.style.height = `${scaledHeight}px`;
        container.style.overflow = 'hidden';
        container.style.margin = '0 auto';

        wrapper.style.width = `${scaledWidth}px`;
        wrapper.style.height = `${scaledHeight}px`;

        // Remove old canvas and SVG if any
        const oldCanvas = wrapper.querySelector('canvas.rendered-pdf');
        if (oldCanvas) oldCanvas.remove();

        const oldSvg = wrapper.querySelector('svg.rendered-pdf');
        if (oldSvg) oldSvg.remove();

        // Render SVG instead of canvas
        const opList = await page.getOperatorList();
        const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
        const svg = await svgGfx.getSVG(opList, scaledViewport);
        svg.classList.add('rendered-pdf');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.zIndex = '0';

        // Force size to match viewport scale
        svg.setAttribute('width', `${scaledWidth}px`);
        svg.setAttribute('height', `${scaledHeight}px`);
        svg.style.width = `${scaledWidth}px`;
        svg.style.height = `${scaledHeight}px`;

        wrapper.appendChild(svg);

        // Keep existing Fabric canvas setup
        const fabricCanvas = window.canvas;
        fabricCanvas.setWidth(scaledWidth);
        fabricCanvas.setHeight(scaledHeight);
        fabricCanvas.calcOffset();

        // Show your UI as before
        toolBar.style.setProperty('display', 'flex', 'important');
        // measureInput.style.setProperty('display', 'flex', 'important');
        uploadWrapperBtns.style.setProperty('display', 'flex', 'important');
    }

    const pdfRemove = () => {
        container.style.display = "none";
        toolBar.style.setProperty('display', 'none', 'important');
        // measureInput.style.setProperty('display', 'none', 'important');
        uploadWrapperBtns.style.setProperty('display', 'none', 'important');
        hideEraserCursor();
        clearCanvasHistory();
        clearCanvas();
    }

    function handleZoom(opt) {
        if (!panModeActive) return;

        opt.e.preventDefault();
        opt.e.stopPropagation();

        const wrapper = document.getElementById('canvas-wrapper');
        const rect = wrapper.getBoundingClientRect();

        const pointerX = opt.e.clientX - rect.left;
        const pointerY = opt.e.clientY - rect.top;

        const delta = opt.e.deltaY;
        const direction = delta > 0 ? -1 : 1;

        const newZoom = zoomLevel + direction * ZOOM_STEP;
        if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

        // Zoom factor
        const zoomFactor = newZoom / zoomLevel;

        // Adjust pan to keep zoom centered at pointer
        panOffsetX = pointerX - (pointerX - panOffsetX) * zoomFactor;
        panOffsetY = pointerY - (pointerY - panOffsetY) * zoomFactor;

        // Apply transform
        wrapper.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${newZoom})`;
        wrapper.style.transformOrigin = '0 0';

        zoomLevel = newZoom;
    }

    function resetZoom() {
        const wrapper = document.getElementById('canvas-wrapper');
        zoomLevel = 1;
        panOffsetX = 0;
        panOffsetY = 0;
        wrapper.style.transform = `translate(0px, 0px) scale(1)`;
    }

    let panOffsetX = 0;
    let panOffsetY = 0;
    let lastPanX, lastPanY;
    let isPanning = false;

    function panMode() {
        clearToolEvents();
        panModeActive = true;

        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        canvas.freeDrawingCursor = 'grab';

        canvas.selection = false;

        canvas.forEachObject(obj => obj.selectable = false);

        const wrapper = document.getElementById('canvas-wrapper');

        // 🖱️ Mouse down for panning
        canvas.on('mouse:down', function (opt) {
            if (!panModeActive) return;
            isPanning = true;

            canvas.defaultCursor = 'grabbing';
            canvas.setCursor('grabbing');
            canvas.renderAll();

            lastPanX = opt.e.clientX;
            lastPanY = opt.e.clientY;
        });

        // 🖱️ Mouse move for panning
        canvas.on('mouse:move', function (opt) {
            if (!isPanning) return;

            const dx = opt.e.clientX - lastPanX;
            const dy = opt.e.clientY - lastPanY;

            panOffsetX += dx;
            panOffsetY += dy;

            wrapper.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${zoomLevel})`;
            wrapper.style.transformOrigin = '0 0';

            lastPanX = opt.e.clientX;
            lastPanY = opt.e.clientY;
        });

        // 🖱️ Mouse up
        canvas.on('mouse:up', function () {
            isPanning = false;
            canvas.defaultCursor = 'grab';
            canvas.setCursor('grab');
            canvas.renderAll();
        });

        // 🧭 Enable zoom only in pan mode
        canvas.on('mouse:wheel', handleZoom);
    }


    function resetPan() {
        const wrapper = document.getElementById('canvas-wrapper');
        panOffsetX = 0;
        panOffsetY = 0;
        wrapper.style.transform = 'translate(0px, 0px)';
    }

    // Display eraser cursor
    function showEraserCursor() {
        eraserCursorBtn.style.display = 'block';
        canvas.upperCanvasEl.style.cursor = 'none';

        canvas.upperCanvasEl.addEventListener('mousemove', updateEraserCursor);
    }

    function updateEraserCursor(e) {
        const size = 40;
        const offset = size / 2;

        eraserCursorBtn.style.left = (e.clientX - offset) + 'px';
        eraserCursorBtn.style.top = (e.clientY - offset) + 'px';
    }

    function hideEraserCursor() {
        eraserCursorBtn.style.display = 'none';
        canvas.upperCanvasEl.style.cursor = 'default';
        canvas.upperCanvasEl.removeEventListener('mousemove', updateEraserCursor);
    }

    function freeHandDrawing() {
        saveHistory();

        clearToolEvents();
        hideEraserCursor();

        // console.log(typeof fabric.EraserBrush);

        canvas.isDrawingMode = true;
        canvas.defaultCursor = 'crosshair';
        canvas.freeDrawingCursor = 'crosshair';
        // canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 2;
        canvas.freeDrawingBrush.color = "#000";

        canvas.getObjects().forEach(obj => obj.erasable = true);
    }

    canvas.on('path:created', saveHistory);
    freeHandDrawing();

    function setLineTool() {
        saveHistory();

        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.freeDrawingCursor = 'crosshair';
        canvas.selection = false;
        canvas.forEachObject(obj => obj.selectable = false);

        let isDrawingLine = false;
        let line;

        clearToolEvents();
        hideEraserCursor();

        canvas.on('mouse:down', function (o) {
            isDrawingLine = true;
            const pointer = canvas.getPointer(o.e);
            const points = [pointer.x, pointer.y, pointer.x, pointer.y];

            line = new fabric.Line(points, {
                strokeWidth: 2,
                fill: 'black',
                stroke: 'black',
                originX: 'center',
                originY: 'center',
                erasable: true
            });

            canvas.add(line);
        });

        canvas.on('mouse:move', function (o) {
            if (!isDrawingLine) return;
            const pointer = canvas.getPointer(o.e);
            line.set({ x2: pointer.x, y2: pointer.y });
            canvas.renderAll();
        });

        canvas.on('mouse:up', function (o) {
            isDrawingLine = false;
        });
    }

    function setAngleLinesTool() {

        if (!scaleFactor || isNaN(scaleFactor) || scaleFactor <= 0) {
            alert("Please calibrate the scale first before drawing lines.");
            return;
        }

        saveHistory();

        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.freeDrawingCursor = 'crosshair';
        canvas.selection = false;
        canvas.forEachObject(obj => obj.selectable = false);

        let isDrawingLine = false;
        let line;

        clearToolEvents();
        hideEraserCursor();

        canvas.on('mouse:down', function (o) {
            saveHistory();

            isDrawingLine = true;
            const pointer = canvas.getPointer(o.e);
            const points = [pointer.x, pointer.y, pointer.x, pointer.y];

            line = new fabric.Line(points, {
                strokeWidth: 2,
                fill: 'black',
                stroke: 'black',
                originX: 'center',
                originY: 'center',
                erasable: true
            });

            canvas.add(line);
        });

        canvas.on('mouse:move', function (o) {
            if (!isDrawingLine) return;

            const pointer = canvas.getPointer(o.e);

            if (o.e.shiftKey) {
                const dx = pointer.x - line.x1;
                const dy = pointer.y - line.y1;

                const angle = Math.atan2(dy, dx);
                const length = Math.sqrt(dx * dx + dy * dy);

                const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

                pointer.x = line.x1 + Math.cos(snapAngle) * length;
                pointer.y = line.y1 + Math.sin(snapAngle) * length;
            }

            line.set({ x2: pointer.x, y2: pointer.y });
            canvas.renderAll();
        });

        canvas.on('mouse:up', function () {
            isDrawingLine = false;

            // Read scale factor from input
            // const scaleInput = document.getElementById('scaleInput');
            // const scaleFactor = parseFloat(scaleInput.value) || 1;

            const dx = line.x2 - line.x1;
            const dy = line.y2 - line.y1;
            const pixelDistance = Math.sqrt(dx * dx + dy * dy);
            const distanceInMM = (pixelDistance * scaleFactor).toFixed(1);

            const midX = (line.x1 + line.x2) / 2;
            const midY = (line.y1 + line.y2) / 2;

            console.log("Line pixel distance:", pixelDistance);
            console.log("scaleFactor:", scaleFactor);
            console.log("Computed mm:", pixelDistance / scaleFactor);

            const label = new fabric.Text(`${distanceInMM} mm`, {
                left: midX,
                top: midY,
                fontSize: 14,
                fill: 'red',
                selectable: false,
                evented: false,
                originX: 'center',
            });

            canvas.add(label);
            canvas.renderAll();
        });
    }


    function setArcTool() {
        saveHistory();

        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        canvas.forEachObject(obj => obj.selectable = false);

        clearToolEvents();
        hideEraserCursor();

        let isDrawing = false;
        let startX, startY;
        let arcPath;

        canvas.on('mouse:down', function (o) {
            isDrawing = true;
            const pointer = canvas.getPointer(o.e);
            startX = pointer.x;
            startY = pointer.y;

            // Start with a very small arc path just to initialize
            arcPath = new fabric.Path(`M ${startX} ${startY} L ${startX} ${startY}`, {
                stroke: 'black',
                strokeWidth: 2,
                fill: '',
                selectable: false,
                evented: false,
                erasable: true,
            });

            canvas.add(arcPath);
        });

        canvas.on('mouse:move', function (o) {
            if (!isDrawing) return;

            const pointer = canvas.getPointer(o.e);

            // Calculate radius and angles for arc
            const dx = pointer.x - startX;
            const dy = pointer.y - startY;
            const radius = Math.sqrt(dx * dx + dy * dy);

            let endAngle = Math.atan2(dy, dx);

            // Calculate end point on circumference
            const endX = startX + radius * Math.cos(endAngle);
            const endY = startY + radius * Math.sin(endAngle);

            // Decide large-arc-flag: if sweep angle > 180°, flag=1 else 0
            const largeArcFlag = Math.abs(endAngle) > Math.PI ? 1 : 0;

            // sweep-flag: 1 for clockwise
            const sweepFlag = 1;

            const startArcX = startX + radius;
            const startArcY = startY;

            const pathData = `M ${startArcX} ${startArcY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;

            const arcPath = new fabric.Path(pathData, {
                stroke: 'black',
                fill: '',
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            canvas.add(arcPath);
            canvas.renderAll();
        });

        canvas.on('mouse:up', function (o) {
            if (!isDrawing) return;
            isDrawing = false;

            // Mark the arc selectable/evented if you want to allow interaction later
            arcPath.set({ selectable: true, evented: true });
            canvas.renderAll();
        });
    }


    let firstPoint = null;
    let tempDot = null;
    let calibrationScaleFactor = null;

    function startCalibrationMode() {
        isCalibrating = true;
        calibrationPoints = [];
        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.freeDrawingCursor = 'crosshair';

        saveHistory();

        clearToolEvents();
        hideEraserCursor();

        alert("Click two points of known real-world distance");

        canvas.on('mouse:down', handleCalibrationClick);
    }

    function handleCalibrationClick(opt) {
        if (!isCalibrating) return;

        const pointer = canvas.getPointer(opt.e);
        calibrationPoints.push(pointer);

        const dot = new fabric.Circle({
            left: pointer.x,
            top: pointer.y,
            radius: 3,
            fill: 'black',
            selectable: false,
            evented: false,
            originX: 'center',
            originY: 'center'
        });
        canvas.add(dot);
        calibrationDots.push(dot);

        if (calibrationPoints.length === 2) {
            // Draw visual calibration line
            const [p1, p2] = calibrationPoints;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const pixelLength = Math.sqrt(dx * dx + dy * dy);

            const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
                stroke: 'black',
                strokeWidth: 2,
                selectable: true,
                evented: false
            });
            canvas.add(line);

            const realLength = parseFloat(prompt("Enter real-world length in mm:"));
            if (!realLength || realLength <= 0) {
                alert("Invalid length. Calibration cancelled.");
                return;
            }

            scaleFactor = realLength / pixelLength;

            // ✅ Create label for calibration line
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            const length = pixelLength || 1;
            const offsetX = -dy / length;
            const offsetY = dx / length;

            const labelX = midX + offsetX * 10;
            const labelY = midY + offsetY * 10;

            console.log("Calibrated pixel length:", pixelLength);
            console.log("Entered real length:", realLength);
            console.log("Scale factor:", scaleFactor);


            const label = new fabric.Text(`${realLength.toFixed(1)} mm`, {
                left: labelX,
                top: labelY,
                fontSize: 14,
                fill: 'red',
                selectable: false,
                evented: false,
                originX: 'center',
                originY: 'center'
            });

            canvas.add(label);

            alert(`Scale set: 1 pixel = ${scaleFactor.toFixed(4)} mm`);

            // ✅ Remove the temporary dots
            calibrationDots.forEach(dot => canvas.remove(dot));
            calibrationDots = [];

            canvas.selection = false;

            // Cleanup
            isCalibrating = false;
            canvas.off('mouse:down', handleCalibrationClick);
            canvas.requestRenderAll();
        }


        canvas.requestRenderAll();
    }


    function setLineToolClickMode() {

        if (!scaleFactor || isNaN(scaleFactor) || scaleFactor <= 0) {
            alert("Please calibrate the scale first before drawing lines.");
            return;
        }

        saveHistory();

        clearToolEvents();
        hideEraserCursor();

        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.freeDrawingCursor = 'crosshair';


        function handleClick(o) {
            const pointer = canvas.getPointer(o.e);

            if (!firstPoint) {
                firstPoint = { x: pointer.x, y: pointer.y };

                tempDot = new fabric.Circle({
                    left: firstPoint.x - 3,
                    top: firstPoint.y - 3,
                    radius: 3,
                    fill: 'black',
                    selectable: false,
                    evented: false
                });
                canvas.add(tempDot);
                canvas.renderAll();

            } else {
                const secondPoint = { x: pointer.x, y: pointer.y };

                // Draw the line
                const line = new fabric.Line(
                    [firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y],
                    {
                        strokeWidth: 2,
                        fill: 'black',
                        stroke: 'black',
                        originX: 'center',
                        originY: 'center',
                        erasable: true
                    }
                );
                canvas.add(line);

                // Calculate distance in pixels
                const dx = secondPoint.x - firstPoint.x;
                const dy = secondPoint.y - firstPoint.y;
                const pixelDistance = Math.sqrt(dx * dx + dy * dy);

                // Convert to mm
                const distanceInMM = (pixelDistance * scaleFactor).toFixed(1);

                // Mid-point of the line
                const midX = (firstPoint.x + secondPoint.x) / 2;
                const midY = (firstPoint.y + secondPoint.y) / 2;

                // Perpendicular unit vector for offset
                const length = pixelDistance || 1; // prevent division by 0
                const offsetX = -dy / length;
                const offsetY = dx / length;

                // Offset the label 10 pixels away from the line
                const labelX = midX + offsetX * 10;
                const labelY = midY + offsetY * 10;

                console.log("Line pixel distance:", pixelDistance);
                console.log("scaleFactor:", scaleFactor);
                console.log("Computed mm:", pixelDistance / scaleFactor);


                // Create and add the dimension label
                const label = new fabric.Text(`${distanceInMM} mm`, {
                    left: labelX,
                    top: labelY,
                    fontSize: 14,
                    fill: 'red',
                    selectable: false,
                    evented: false,
                    originX: 'center',
                    originY: 'center'
                });
                canvas.add(label);

                canvas.selection = false;
                canvas.forEachObject(obj => obj.selectable = false);

                // Clean up
                if (tempDot) {
                    canvas.remove(tempDot);
                    tempDot = null;
                }

                canvas.renderAll();
                firstPoint = null;
            }
        }

        canvas.on('mouse:down', handleClick);
    }


    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (tempDot) {
                canvas.remove(tempDot);
                tempDot = null;
            }
            firstPoint = null;
            canvas.renderAll();
        }
    });

    function setEraser() {
        saveHistory();

        clearToolEvents();
        canvas.isDrawingMode = true;

        showEraserCursor();

        if (fabric.EraserBrush) {
            canvas.freeDrawingBrush = new fabric.EraserBrush(canvas);
            canvas.freeDrawingBrush.width = 40;
        } else {
            const eraser = new fabric.PencilBrush(canvas);
            eraser.width = 40;
            eraser.color = '#fff';
            canvas.freeDrawingBrush = eraser;
        }

        canvas.freeDrawingCursor = 'grab';
        canvas.selection = false;
        canvas.forEachObject(obj => obj.selectable = false);
    }

    function addRect() {
        saveHistory();

        // Make sure drawing mode is off
        canvas.isDrawingMode = false;
        clearToolEvents?.();
        hideEraserCursor?.();

        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.freeDrawingCursor = 'default';

        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            width: 100,
            height: 80,
            fill: 'rgba(0, 0, 255, 0.2)',
            stroke: '#000',
            strokeWidth: 2,
            erasable: true,
            selectable: true,
            evented: true
        });

        canvas.add(rect);
        canvas.requestRenderAll();
    }

    function addCircle() {
        saveHistory();

        canvas.isDrawingMode = false;
        clearToolEvents?.();
        hideEraserCursor?.();

        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.freeDrawingCursor = 'default';

        const circle = new fabric.Circle({
            left: 150,
            top: 150,
            radius: 40,
            fill: 'rgba(255, 0, 0, 0.2)',
            stroke: '#000',
            strokeWidth: 2,
            erasable: true,
            selectable: true,
            evented: true
        });

        canvas.add(circle);
        canvas.requestRenderAll();
    }

    function addText() {
        saveHistory();

        canvas.isDrawingMode = false;
        clearToolEvents();
        hideEraserCursor();

        const text = new fabric.IText('Type..', {
            left: 100,
            top: 200,
            fill: '#000',
            fontSize: 20,
            erasable: true
        });
        canvas.add(text);
        text.enterEditing();
    }

    function clearCanvas() {
        canvas.isDrawingMode = false;
        clearToolEvents();
        hideEraserCursor();
        canvas.defaultCursor = 'default';
        canvas.freeDrawingCursor = 'default';
        canvas.clear();

        // canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));
    }



    function enableArrowTool() {
        clearToolEvents();
        isArrowToolActive = true;

        canvas.isDrawingMode = false;
        canvas.selection = false;

        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';

        setupArrowToolEvents();
    }

    function disableArrowTool() {
        isArrowToolActive = false;
        arrowLine = null;
        arrowHead = null;
    }

    function setupArrowToolEvents() {
        canvas.off('mouse:down', onArrowMouseDown);
        canvas.off('mouse:move', onArrowMouseMove);
        canvas.off('mouse:up', onArrowMouseUp);

        canvas.on('mouse:down', onArrowMouseDown);
        canvas.on('mouse:move', onArrowMouseMove);
        canvas.on('mouse:up', onArrowMouseUp);
    }

    function onArrowMouseDown(opt) {
        if (!isArrowToolActive) return;

        const pointer = canvas.getPointer(opt.e);
        const points = [pointer.x, pointer.y, pointer.x, pointer.y];

        arrowLine = new fabric.Line(points, {
            strokeWidth: 2,
            fill: 'black',
            stroke: 'black',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
        });

        canvas.add(arrowLine);
    }

    function onArrowMouseMove(opt) {
        if (!isArrowToolActive || !arrowLine) return;

        const pointer = canvas.getPointer(opt.e);
        arrowLine.set({ x2: pointer.x, y2: pointer.y });

        if (arrowHead) {
            canvas.remove(arrowHead);
        }

        arrowHead = makeArrowHead(
            arrowLine.get('x1'),
            arrowLine.get('y1'),
            pointer.x,
            pointer.y
        );

        canvas.add(arrowHead);
        canvas.renderAll();
    }

    function onArrowMouseUp() {
        if (!isArrowToolActive || !arrowLine || !arrowHead) return;

        const arrowGroup = new fabric.Group([arrowLine, arrowHead], {
            selectable: true,
            hasControls: true,
        });

        canvas.add(arrowGroup);
        canvas.remove(arrowLine);
        canvas.remove(arrowHead);

        arrowLine = null;
        arrowHead = null;

        saveHistory();
    }

    function makeArrowHead(x1, y1, x2, y2) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;

        const arrowX = x2;
        const arrowY = y2;

        const arrowHeadPoints = [
            {
                x: arrowX - headLength * Math.cos(angle - Math.PI / 6),
                y: arrowY - headLength * Math.sin(angle - Math.PI / 6),
            },
            {
                x: arrowX,
                y: arrowY,
            },
            {
                x: arrowX - headLength * Math.cos(angle + Math.PI / 6),
                y: arrowY - headLength * Math.sin(angle + Math.PI / 6),
            },
        ];

        return new fabric.Polygon(arrowHeadPoints, {
            fill: 'black',
            stroke: 'black',
            selectable: false,
            evented: false,
        });
    }

    function groupSelected() {
        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects || activeObjects.length < 2) return;

        const group = new fabric.Group(activeObjects);
        canvas.discardActiveObject();
        activeObjects.forEach(obj => canvas.remove(obj));
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
        saveHistory();
    }


    async function exportPDF() {
        clearToolEvents();

        const pdfCanvas = document.querySelector('canvas.rendered-pdf');
        const fabricCanvas = document.getElementById('myCanvas');

        const exportScale = 4;

        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = pdfCanvas.width * exportScale;
        mergedCanvas.height = pdfCanvas.height * exportScale;

        const mergedContext = mergedCanvas.getContext('2d');
        mergedContext.scale(exportScale, exportScale);

        mergedContext.drawImage(pdfCanvas, 0, 0);
        mergedContext.drawImage(fabricCanvas, 0, 0);

        const dataURL = mergedCanvas.toDataURL('image/png');

        const orientation = mergedCanvas.width > mergedCanvas.height ? 'landscape' : 'portrait';
        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [mergedCanvas.width, mergedCanvas.height]
        });

        pdf.addImage(dataURL, 'PNG', 0, 0, mergedCanvas.width, mergedCanvas.height);

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];

        const baseName = uploadedPDFName
            ? uploadedPDFName.replace(/\.pdf$/i, '')
            : 'final';

        const finalName = `${baseName}_MarkUp-${formattedDate}.pdf`;
        pdf.save(finalName);

    }

    async function exportPDFHighQuality() {
        const fabricCanvas = window.canvas;
        if (!fabricCanvas || typeof fabricCanvas.toDataURL !== 'function') {
            console.error("Fabric canvas not available.");
            return;
        }

        // Get the original uploaded PDF as ArrayBuffer
        const fileInput = document.getElementById('pdf-upload');
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();

        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);

        const page = pdfDoc.getPages()[0];

        // Export Fabric drawing as PNG (transparent background)
        const overlayDataURL = fabricCanvas.toDataURL({
            format: 'png',
            multiplier: 4, // High resolution
        });

        const pngImageBytes = await fetch(overlayDataURL).then(res => res.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngImageBytes);

        const { width, height } = page.getSize();

        // Scale overlay image to fit the page
        page.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
        });

        const finalPdfBytes = await pdfDoc.save();
        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        const baseName = uploadedPDFName
            ? uploadedPDFName.replace(/\.pdf$/i, '')
            : 'final';

        const finalName = `${baseName}_MarkUp-${formattedDate}.pdf`;

        // Download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = finalName;
        link.click();
    }

    canvas.on('selection:created', function (e) {
        // alert("Selected")
        console.log('Selected:', e.selected);
    });

    canvas.on('selection:updated', function (e) {
        console.log('Selection updated:', e.selected);
    });

    canvas.on('selection:cleared', function () {
        console.log('Selection cleared');
    });

    // GROUP
    function groupSelectedObjects() {
        const active = canvas.getActiveObject();

        if (active && active.type === 'activeSelection') {
            // Convert selection to group
            const group = active.toGroup();
            canvas.setActiveObject(group);
            canvas.requestRenderAll();
            saveHistory?.();
        } else {
            alert("Select multiple shapes by Shift+Click or drag-select.");
        }
    }

    function ungroupSelectedObject() {
        const activeObject = canvas.getActiveObject();

        if (activeObject && activeObject.type === 'group') {
            activeObject.toActiveSelection(); // Break group into selection
            canvas.requestRenderAll();
            saveHistory?.();
        }
    }

    function selectAllObjects() {
        canvas.discardActiveObject();

        const objects = canvas.getObjects();
        if (objects.length > 1) {
            const selection = new fabric.ActiveSelection(objects, { canvas });
            canvas.setActiveObject(selection);
            canvas.requestRenderAll();
        }
    }

    // LAYERING
    function bringSelectedForward() {
        const obj = canvas.getActiveObject();
        if (obj) {
            obj.bringForward();
            canvas.requestRenderAll();
            saveHistory();
        }
    }

    function sendSelectedBackward() {
        const obj = canvas.getActiveObject();
        if (obj) {
            obj.sendBackwards();
            canvas.requestRenderAll();
            saveHistory();
        }
    }

    function clearToolEvents() {
        disableArrowTool();

        // Remove all event listeners related to tools
        canvas.off('mouse:down');
        canvas.off('mouse:move');
        canvas.off('mouse:up');
        canvas.off('mouse:wheel');
        // resetZoom();
        // resetPan();

        // Reset Fabric.js drawing mode
        canvas.isDrawingMode = false;
        // canvas.selection = false;

        // Reset cursors
        // canvas.defaultCursor = 'default';
        // canvas.hoverCursor = 'default';
        // canvas.freeDrawingCursor = 'default';

        // Disable selecting all objects
        // canvas.forEachObject(obj => obj.selectable = false);

        // Reset pan mode state
        panModeActive = false;
        isPanning = false;
    }


    // All events
    pdfUploadBtn.addEventListener("change", (e) => pdfUpload(e));
    pdfRemoveBtn.addEventListener("click", pdfRemove);
    panModeBtn.addEventListener("click", panMode);
    freeHandDrawingBtn.addEventListener("click", freeHandDrawing);
    setLineToolClickModeBtn.addEventListener("click", setLineToolClickMode);
    setScaleCalibrationToolBtn.addEventListener("click", startCalibrationMode);
    // setArcToolBtn.addEventListener("click", setArcTool);
    setAngleLinesToolBtn.addEventListener("click", setAngleLinesTool);
    setEraserBtn.addEventListener("click", setEraser);
    addRectBtn.addEventListener("click", addRect);
    addCircleBtn.addEventListener("click", addCircle);
    addTextBtn.addEventListener("click", addText);
    addArrowBtn.addEventListener("click", enableArrowTool);
    clearCanvasBtn.addEventListener("click", clearCanvas);
    undoCanvasBtn.addEventListener("click", undo);
    redoCanvasBtn.addEventListener("click", redo);
    exportPDFBtn.addEventListener("click", exportPDFHighQuality);

    document.getElementById('groupBtn').addEventListener('click', groupSelectedObjects);
    document.getElementById('ungroupBtn').addEventListener('click', ungroupSelectedObject);
    document.getElementById('bringForwardBtn').addEventListener('click', bringSelectedForward);
    document.getElementById('sendBackwardBtn').addEventListener('click', sendSelectedBackward);

});
