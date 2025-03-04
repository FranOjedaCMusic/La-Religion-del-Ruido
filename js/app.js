var effectsPanelVisivility = false;

async function setup() {
    const patchExportURL = "export/patch.export.json";

    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();
    outputNode.connect(context.destination);
    
    // Fetch the exported patcher
    let response, patcher;
    try {
        response = await fetch(patchExportURL);
        patcher = await response.json();
    
        if (!window.RNBO) {
            // Load RNBO script dynamically
            // Note that you can skip this by knowing the RNBO version of your patch
            // beforehand and just include it using a <script> tag
            await loadRNBOScript(patcher.desc.meta.rnboversion);
        }

    } catch (err) {
        const errorContext = {
            error: err
        };
        if (response && (response.status >= 300 || response.status < 200)) {
            errorContext.header = `Couldn't load patcher export bundle`,
            errorContext.description = `Check app.js to see what file it's trying to load. Currently it's` +
            ` trying to load "${patchExportURL}". If that doesn't` + 
            ` match the name of the file you exported from RNBO, modify` + 
            ` patchExportURL in app.js.`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }
    
    // (Optional) Fetch the dependencies
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch("export/dependencies.json");
        dependencies = await dependenciesResponse.json();

        // Prepend "export" to any file dependenciies
        dependencies = dependencies.map(d => d.file ? Object.assign({}, d, { file: "export/" + d.file }) : d);
    } catch (e) {}

    // Create the device
    let device;
    try {
        device = await RNBO.createDevice({ context, patcher });
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({ error: err });
        } else {
            throw err;
        }
        return;
    }

    // (Optional) Load the samples
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);

    // Connect the device to the web audio graph
    device.node.connect(outputNode);

    // (Optional) Extract the name and rnbo version of the patcher from the description
    document.getElementById("patcher-title").innerText = (patcher.desc.meta.filename || "Cargando. Por favor espera.") ;


    // (Optional) Automatically create sliders for the device parameters
    
    makeSliders(device);
    
    // Creación de las checkboxes para playsmpa/stopsmpa en su propio div
    makeCheckboxes(device,"a");
    makeCheckboxes(device, "b");
    makeCheckboxes(device, "c");
    makeCheckboxes(device, "d");
    makeCheckboxes(device, "e");
    makeCheckboxes(device, "f");
    makeCheckboxes(device, "g");
    makeCheckboxes(device, "h");

    // (Optional) Create a form to send messages to RNBO inputs
    makeInportForm(device);

    // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
    attachOutports(device);

    // (Optional) Load presets, if any
    loadPresets(device, patcher);

    // (Optional) Connect MIDI inputs
    makeMIDIKeyboard(device);

    document.body.onclick = () => {
        context.resume();
    }

    // Skip if you're not using guardrails.js
    if (typeof guardrails === "function")
        guardrails();
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            throw new Error("Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.");
        }
        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            console.log(err);
            reject(new Error("Failed to load rnbo.js v" + version));
        };
        document.body.append(el);
    });
}

function makeSliders(device) {
    let pdiv = document.getElementById("rnbo-parameter-sliders");
    let noParamLabel = document.getElementById("no-param-label");
    if (noParamLabel && device.numParameters > 0) pdiv.removeChild(noParamLabel);
    
   
    // This will allow us to ignore parameter update events while dragging the slider.
    let isDraggingSlider = false;
    let uiElements = {};

   // Solo mostrar sliders para FX_1, FX_2, FX_3 y FX_4
const targetParams = ["FX_1_Clean", "FX_2_Space", "FX_3_Dirt", "FX_4_Glitch"];

device.parameters.forEach(param => {
    if (!targetParams.includes(param.name)) return; // Ignorar otros parámetros

    // Crear elementos para el slider
    let slider = document.createElement("input");
    let sliderContainer = document.createElement("div");
    let label = document.createElement("label");
    let text = document.createElement("span");

    slider.type = "range";
    slider.min = param.min;
    slider.max = param.max;
    slider.step = (param.max - param.min) / 100;
    slider.value = param.value;

    label.textContent = `${param.displayName}: `;
    label.setAttribute("for", param.displayName);
    label.setAttribute("class", "param-label");

    text.textContent = param.value.toFixed(2);

    slider.addEventListener("input", (event) => {
        const newValue = parseFloat(event.target.value);
        param.value = newValue;
        text.textContent = newValue.toFixed(2);
    });

    // Agregar los elementos al contenedor
    sliderContainer.appendChild(label);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(text);

    document.getElementById("rnbo-parameter-sliders").appendChild(sliderContainer);
});
}
function makeCheckboxes(device, column) {
    let elementId = "rnbo-parameter-checkboxes-"+column
    let playsmp = "playsmp" + column;
    let stopsmp = "stopsmp" + column;
    let cdiv = document.getElementById(elementId);
    let noParamLabel = document.getElementById("no-checkboxes-label");
    if (noParamLabel && device.numParameters > 0) cdiv.removeChild(noParamLabel);

    let currentSample = null;

    // Asumiendo que tienes los parámetros "playsmpa" y "stopsmpa"
    let playsmpa = device.parameters.find(param => param.name === playsmp);
    let stopsmpa = device.parameters.find(param => param.name === stopsmp);
    // Crear 8 checkboxes
    for (let i = 0; i < 8; i++) {
  
        // Crear un label y una checkbox
        let label = document.createElement("label");
        let checkbox = document.createElement("input");
        let checkboxContainer = document.createElement("div");
        checkboxContainer.appendChild(label);
        checkboxContainer.appendChild(checkbox);

        // Configurar el label
        label.setAttribute("for", `checkbox${i}`);
        label.textContent = ``;

        // Configurar la checkbox
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("id", `checkbox${i}`);
        checkbox.setAttribute("name", `checkbox${i}`);

        // Acción al hacer clic en una checkbox
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                // Desactivar el sample actual (si hay uno activo)
                if (currentSample) currentSample.checked = false;
                stopsmpa.value = 0;
                // Asignar el valor correspondiente (0-7) al parámetro "playsmpa"
                playsmpa.value = -1.0
                playsmpa.value = i;  // El valor corresponde al índice de la checkbox
                currentSample = checkbox;

            } else {
                // Si se desmarca, enviar el valor 1 al "stopsmpa"
                stopsmpa.value = 1;
                currentSample = null;
            }
        });

        // Añadir la checkbox al contenedor
        cdiv.appendChild(checkboxContainer);
    }
}   
    
function makeInportForm(device) {
    const idiv = document.getElementById("rnbo-inports");
    const inportSelect = document.getElementById("inport-select");
    const inportText = document.getElementById("inport-text");
    const inportForm = document.getElementById("inport-form");
    let inportTag = null;
    
    // Device messages correspond to inlets/outlets or inports/outports
    // You can filter for one or the other using the "type" of the message
    const messages = device.messages;
    const inports = messages.filter(message => message.type === RNBO.MessagePortType.Inport);

    if (inports.length === 0) {
        idiv.removeChild(document.getElementById("inport-form"));
        return;
    } else {
        idiv.removeChild(document.getElementById("no-inports-label"));
        inports.forEach(inport => {
            const option = document.createElement("option");
            option.innerText = inport.tag;
            inportSelect.appendChild(option);
        });
        inportSelect.onchange = () => inportTag = inportSelect.value;
        inportTag = inportSelect.value;

        inportForm.onsubmit = (ev) => {
            // Do this or else the page will reload
            ev.preventDefault();

            // Turn the text into a list of numbers (RNBO messages must be numbers, not text)
            const values = inportText.value.split(/\s+/).map(s => parseFloat(s));
            
            // Send the message event to the RNBO device
            let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
            device.scheduleEvent(messageEvent);
        }
    }
}

function attachOutports(device) {
    const outports = device.outports;
    if (outports.length < 1) {
        document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
        return;
    }

    document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
    device.messageEvent.subscribe((ev) => {

        // Ignore message events that don't belong to an outport
        if (outports.findIndex(elt => elt.tag === ev.tag) < 0) return;

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);

        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}

function loadPresets(device, patcher) {
    let presets = patcher.presets || [];
    if (presets.length < 1) {
        document.getElementById("rnbo-presets").removeChild(document.getElementById("preset-select"));
        return;
    }

    document.getElementById("rnbo-presets").removeChild(document.getElementById("no-presets-label"));
    let presetSelect = document.getElementById("preset-select");
    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.innerText = preset.name;
        option.value = index;
        presetSelect.appendChild(option);
    });
    presetSelect.onchange = () => device.setPreset(presets[presetSelect.value].preset);
}

function makeMIDIKeyboard(device) {
    let mdiv = document.getElementById("rnbo-clickable-keyboard");
    if (device.numMIDIInputPorts === 0) return;

    mdiv.removeChild(document.getElementById("no-midi-label"));

    const midiNotes = [49, 52, 56, 63];
    midiNotes.forEach(note => {
        const key = document.createElement("div");
        const label = document.createElement("p");
        label.textContent = note;
        key.appendChild(label);
        key.addEventListener("pointerdown", () => {
            let midiChannel = 0;

            // Format a MIDI message paylaod, this constructs a MIDI on event
            let noteOnMessage = [
                144 + midiChannel, // Code for a note on: 10010000 & midi channel (0-15)
                note, // MIDI Note
                100 // MIDI Velocity
            ];
        
            let noteOffMessage = [
                128 + midiChannel, // Code for a note off: 10000000 & midi channel (0-15)
                note, // MIDI Note
                0 // MIDI Velocity
            ];
        
            // Including rnbo.min.js (or the unminified rnbo.js) will add the RNBO object
            // to the global namespace. This includes the TimeNow constant as well as
            // the MIDIEvent constructor.
            let midiPort = 0;
            let noteDurationMs = 250;
        
            // When scheduling an event to occur in the future, use the current audio context time
            // multiplied by 1000 (converting seconds to milliseconds) for now.
            let noteOnEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000, midiPort, noteOnMessage);
            let noteOffEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000 + noteDurationMs, midiPort, noteOffMessage);
        
            device.scheduleEvent(noteOnEvent);
            device.scheduleEvent(noteOffEvent);

            key.classList.add("clicked");
        });

        key.addEventListener("pointerup", () => key.classList.remove("clicked"));

        mdiv.appendChild(key);
    });
}



/* Hide welcome screen */
function hideWelcome() {
    var div = document.getElementById("WelcomeScreen");
    div.classList.add("hide");
}



setup();



function effectsPanel(){
    var panel = document.getElementById("rnbo-parameter-sliders");
    if (effectsPanelVisivility) {
        effectsPanelVisivility = false;
        panel.classList.remove("up");
        panel.classList.add("down");
    }
    else{
        effectsPanelVisivility = true;
        panel.classList.remove("down");
        panel.classList.add("up");
        
    
    }
}

