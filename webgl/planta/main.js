
const glMatrix = (/** @type {import('gl-matrix')} */(window)).glMatrix;
const vec2 = (/** @type {import('gl-matrix')} */(window)).vec2,
      vec3 = (/** @type {import('gl-matrix')} */(window)).vec3,
      vec4 = (/** @type {import('gl-matrix')} */(window)).vec4,
      mat2 = (/** @type {import('gl-matrix')} */(window)).mat2,
      mat3 = (/** @type {import('gl-matrix')} */(window)).mat3,
      mat4 = (/** @type {import('gl-matrix')} */(window)).mat4;

/** @type {import('dat.gui')} */
const dat = window.dat;

/** @type { import('sweetalert2').default } */
const swal = window.swal;

const ctxmenu = (/** @type { import('ctxmenu') } */(window)).ctxmenu;

const saveAs = (/** @type { import('file-saver') } */(window)).saveAs;

const canvas = document.getElementById('canvas');

/** @type { WebGL2RenderingContext } */
const gl = canvas.getContext('webgl2');

const default_program = gl.createProgram();
let program = default_program;

/** @param { WebGLProgram } _program */
function useProgram(_program){
    gl.useProgram(_program);
    program = _program;
}

const objectAtlas = {
    program: gl.createProgram(),
    texture: gl.createTexture(),
    depthBuffer: gl.createRenderbuffer(),
    frameBuffer: gl.createFramebuffer(),
    resize(){
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.drawingBufferWidth, gl.drawingBufferHeight);
    },
    colorFromId: id => new Float32Array([ (id >> 24) & 0xFF, (id >> 16) & 0xFF, (id >> 8) & 0xFF, id & 0xFF ].map(x => x / 255)),
    // idFromColor: color => { const c = color.map(x => x * 255); return (c[0] << 24) | (c[1] << 16) | (c[2] << 8) | (c[3]); },
    idFromColor: c => ((c[0] << 23) * 2) + ((c[1] << 16) | (c[2] << 8) | (c[3])),
};

const gui = new dat.GUI();

/**
 * @typedef DraggingCamera
 * @property {number[]} initial_position_screen_space (em pixels do screen space)
 * @property {number[]} initial_position_world (em metros)
 */

const mouse = {
    /** @type {GObject} */
    dragging: null,

    /** @type {DraggingCamera} */
    dragging_camera: null,
};

const getDefaultConfig = () => ({
    escala_pixels_por_metro: 80,
    camera_position: [ 0, 0 ],
});

const config = getDefaultConfig();

/** @type {GObject[]} */
const objects = [];

let should_invalidate = true;

function getShader(id){
    const script = document.getElementById(id);
    const shaderString = script.text.trim();

    let shader;
    if (script.type === 'x-shader/x-vertex')
        shader = gl.createShader(gl.VERTEX_SHADER);
    else if (script.type === 'x-shader/x-fragment')
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    else
        return null;

    gl.shaderSource(shader, shaderString);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        console.error(gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function serializeProperties(obj, keys){
    const r = {};
    for(let k of keys)
        r[k] = obj[k];
    return JSON.parse(JSON.stringify(r));
}

class Shape {
    constructor(x, y){
        this.x = x;
        this.y = y;
        this.size = [1, 1];
        this.color = [0, 0, 0, 1];
        
        /** rotação em radianos */
        this.rotation = 0;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.vertices = this.getTriangles();

        this.vbuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
        gl.vertexAttribPointer(program.a_position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.a_position);
    }

    get serializable_properties() { return ['x','y','size','color','rotation']; };

    /** retorna os triângulos no espaço do objeto */
    getTriangles(){ 
        return [];
    }
    cleanup(){
        if(this.vao != null){
            gl.deleteVertexArray(this.vao);
            this.vao = null;
        }
        if(this.vbuffer != null){
            gl.deleteBuffer(this.vbuffer);
            this.vbuffer = null;
        }
    }
    serialize(){
        return serializeProperties(this, this.serializable_properties);
    }
}

class Parede extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color[3] = .5;
    }
    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class Janela extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color[3] = 1;
    }
    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class Abertura extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color = [1,1,1,1];
        this.line_color = [0,0,.7,1];
    }

    get serializable_properties() { return super.serializable_properties.concat('line_color'); };

    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class Porta_Parte1 extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color = [.5,.22,.03,1];
        this.line_color = [0,0,.7,1];
    }

    get serializable_properties() { return super.serializable_properties.concat('line_color'); };

    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class Porta_Parte2 extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color = [1,1,1,1];
        this.line_color = [0,0,.7,1];
    }

    get serializable_properties() { return super.serializable_properties.concat('line_color'); };

    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    generateQuarterCircle(subdivs){
        const r = 2;
        const x0 = 1;
        const y0 = -1;
        const start_angle = Math.PI/2;
        const end_angle = Math.PI;
        const step = (end_angle - start_angle) / subdivs;

        const verts = [];
        for(let i = 0; i <= subdivs; i++){
            const x = x0 + r * Math.cos(start_angle + i * step);
            const y = y0 + r * Math.sin(start_angle + i * step);
            verts.push(x);
            verts.push(y);
        }
        return verts;
    }
    getTriangles(){ 
        return [
            -1,-1,
            1,-1,
            1,1,
            ...this.generateQuarterCircle(20),
        ];
    }
}

class Escada_Parte1 extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color = [1,1,1,1];
        this.line_color = [0,0,.7,1];
    }

    get serializable_properties() { return super.serializable_properties.concat('line_color'); };

    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class Escada_Parte2 extends Shape {
    constructor(x, y, espessura, comprimento){ //unidade em metros
        super(x, y);

        this.espessura = espessura;
        this.comprimento = comprimento;
        this.color[3] = .5;
        this.line_color = [0,0,.7,1];
    }

    get serializable_properties() { return super.serializable_properties.concat('line_color'); };

    set espessura(metros){
        this.size[0] = metros;
    }
    get espessura(){
        return this.size[0];
    }
    set comprimento(metros){
        this.size[1] = metros;
    }
    get comprimento(){
        return this.size[1];
    }
    getTriangles(){ 
        return [
            1,-1,
            1,1,
            -1,1,

            -1,1,
            -1,-1,
            1,-1,
        ];
    }
}

class GObject {
    static _uid = 0 >>> 0;
    static resetUid(){ GObject._uid = 0 >>> 0; }

    constructor(x, y){
        /** @type {Shape[]} */
        this.shapes = [];
        this.layer = 0;

        this.x = x;
        this.y = y;
        this.scale = [1,1];
        this.rotation = 0;

        this.id = GObject._uid++;
    }

    get name(){ return 'Objeto'; }

    get serializable_properties() { return ['layer','x','y','scale','rotation']; };

    /** @returns {number} */ get espessura(){ throw new Error('Not implemented'); }
    /** @param {number} v */ set espessura(v){ throw new Error('Not implemented'); }

    /** @returns {number} */ get comprimento(){ throw new Error('Not implemented'); }
    /** @param {number} v */ set comprimento(v){ throw new Error('Not implemented'); }

    computeTransform(){
        const scale = mat4.fromScaling(mat4.create(), [ ...this.scale, 1 ]);

        const translation = mat4.fromValues(
            1, 0, 0, this.x - config.camera_position[0],
            0, 1, 0, this.y - config.camera_position[1],
            0, 0, 1, 0,
            0, 0, 0, 1,
        );

        const rotation = mat4.fromZRotation(mat4.create(), this.rotation);

        const transform = mat4.identity(mat4.create());
        mat4.mul(transform, transform, scale);
        mat4.mul(transform, transform, rotation);
        mat4.mul(transform, transform, translation);

        return transform;
    }

    /** @param {Shape} shape */
    computeShapeTransform(shape, parent_transform = mat4.identity(mat4.create())){
        const scale = mat4.fromScaling(mat4.create(), [ ...shape.size, 1 ]);

        const translation = mat4.fromValues(
            1, 0, 0, shape.x,
            0, 1, 0, shape.y,
            0, 0, 1, 0,
            0, 0, 0, 1,
        );

        const rotation = mat4.fromZRotation(mat4.create(), shape.rotation);

        const transform = mat4.identity(mat4.create());
        mat4.mul(transform, transform, scale);
        mat4.mul(transform, transform, rotation);
        mat4.mul(transform, transform, translation);
        mat4.mul(transform, transform, parent_transform);

        return transform;
    }

    draw(){
        const transform = this.computeTransform();

        for(let i = 0; i < this.shapes.length; i++){
            this.prepareDrawShape(i, transform);
            this.drawShape(i);
        }
    }

    prepareDrawShape(index, parent_transform = mat4.identity(mat4.create())){
        const shape = this.shapes[index];

        gl.bindVertexArray(shape.vao);

        const transform = this.computeShapeTransform(shape, parent_transform);

        gl.uniformMatrix4fv(program.u_transform, false, transform);

        if(program === default_program){
            gl.uniform1ui(program.u_dashed, 0);
            gl.uniform4f(program.u_color, ...shape.color);
        }
        else if(program === objectAtlas.program){
            gl.uniform4f(program.u_id, ...objectAtlas.colorFromId(this.id));
        }
    }

    drawShape(index){
        const shape = this.shapes[index];
        gl.drawArrays(gl.TRIANGLES, 0, shape.vertices.length / 2);
    }

    cleanup(){
        for(let shape of this.shapes)
            shape.cleanup();
    }

    serialize(){
        return {
            _type: this.constructor.name,
            ...serializeProperties(this, this.serializable_properties),
            shapes: this.shapes.map(x => x.serialize()),
        };
    }

    load(data){
        for(let k in data){
            if(k === 'shapes'){
                for(let i = 0; i < this.shapes.length; i++)
                    Object.assign(this.shapes[i], data.shapes[i]);
            }
            else {
                this[k] = data[k];
            }
        }
    }
}

class GParede extends GObject {
    constructor(x, y, espessura = .15, comprimento = 1){
        super(x, y);
        this.shapes.push(new Parede(0, 0, espessura, comprimento));
        this.layer = 0;
    }

    get name(){ return 'Parede'; }

    /** @returns {number} */ get espessura(){ return this.shapes[0].espessura; }
    /** @param {number} v */ set espessura(v){ this.shapes[0].espessura = v; }

    /** @returns {number} */ get comprimento(){ return this.shapes[0].comprimento; }
    /** @param {number} v */ set comprimento(v){ this.shapes[0].comprimento = v; }
}

class GJanela extends GObject {
    constructor(x, y, espessura = .07, comprimento = .5){
        super(x, y);
        this.shapes.push(new Janela(0, 0, espessura, comprimento));
        this.layer = 1;
    }

    get name(){ return 'Janela'; }

    /** @returns {number} */ get espessura(){ return this.shapes[0].espessura; }
    /** @param {number} v */ set espessura(v){ this.shapes[0].espessura = v; }

    /** @returns {number} */ get comprimento(){ return this.shapes[0].comprimento; }
    /** @param {number} v */ set comprimento(v){ this.shapes[0].comprimento = v; }
}

class GAbertura extends GObject {
    constructor(x, y, espessura = .25, comprimento = .6){
        super(x, y);
        this.shapes.push(new Abertura(0, 0, espessura, comprimento));
        this.layer = 1;
    }

    get name(){ return 'Abertura'; }
    
    /** @returns {number} */ get espessura(){ return this.shapes[0].espessura; }
    /** @param {number} v */ set espessura(v){ this.shapes[0].espessura = v; }

    /** @returns {number} */ get comprimento(){ return this.shapes[0].comprimento; }
    /** @param {number} v */ set comprimento(v){ this.shapes[0].comprimento = v; }

    drawShape(index){
        /** @type {Abertura} */
        const shape = this.shapes[index];

        if(program === objectAtlas.program){
            super.drawShape(index);
        }
        else {
            gl.drawArrays(gl.TRIANGLES, 0, shape.vertices.length / 2);
            gl.uniform4f(program.u_color, ...shape.line_color);
            gl.uniform1ui(program.u_dashed, 1);
            gl.drawArrays(gl.LINE_STRIP, 0, shape.vertices.length / 2);
        }
    }
}

class GPorta extends GObject {
    constructor(x, y, espessura = .05, comprimento = .75){
        super(x, y);
        this.shapes.push(new Porta_Parte1(0, 0, espessura, comprimento));
        this.shapes.push(new Porta_Parte2(-espessura - comprimento, 0, comprimento, comprimento));
        this.layer = 1;
    }

    get name(){ return 'Porta'; }
    
    /** @returns {number} */ get espessura(){ return this.shapes[0].espessura; }
    /** @param {number} v */ set espessura(v){ this.shapes[0].espessura = v; this.shapes[1].x = -v - this.comprimento; }

    /** @returns {number} */ get comprimento(){ return this.shapes[0].comprimento; }
    /** @param {number} v */ set comprimento(v){ this.shapes.forEach(x => x.comprimento = v); this.shapes[1].espessura = v; this.shapes[1].x = -this.espessura - v; }

    drawShape(index){
        /** @type {Abertura} */
        const shape = this.shapes[index];

        if(program === objectAtlas.program){
            super.drawShape(index);
        }
        else {
            if(index === 0)
                gl.drawArrays(gl.TRIANGLES, 0, shape.vertices.length / 2);

            gl.uniform4f(program.u_color, ...shape.line_color);
            gl.uniform1ui(program.u_dashed, 0);
            gl.drawArrays(gl.LINE_STRIP, 0, shape.vertices.length / 2);
        }
    }
}

class GEscada_Base extends GObject {
    static divs = 8;

    constructor(x, y, espessura = .85, comprimento = 1.85){
        super(x, y);
        const step = comprimento / GEscada_Base.divs;
        for(let i = this.skip; i < GEscada_Base.divs; i++)
            this.shapes.push(new Escada_Parte2(0, (comprimento - step) - step * 2 * i, espessura, step));
        this.shapes.push(new Escada_Parte1(0, 0, espessura, comprimento));

        this.layer = 0;
    }

    get name(){ return 'Escada (base)'; }

    get skip(){ return 0; }

    /** @returns {number} */ get espessura(){ return this.shapes[this.shapes.length - 1].espessura; }
    /** @param {number} v */ set espessura(v){ this.shapes.forEach(x => x.espessura = v); }

    /** @returns {number} */ get comprimento(){ return this.shapes[this.shapes.length - 1].comprimento; }
    /** @param {number} v */
    set comprimento(v){
        this.shapes[this.shapes.length - 1].comprimento = v;
        
        const step = v / GEscada_Base.divs;
        for(let i = 0; i < GEscada_Base.divs - this.skip; i++){
            this.shapes[i].y = (v - step) - step * 2 * (this.skip + i);
            this.shapes[i].comprimento = step;
        }
    }

    drawShape(index){
        /** @type {Abertura} */
        const shape = this.shapes[index];

        if(program === objectAtlas.program){
            super.drawShape(index);
        }
        else {
            gl.drawArrays(gl.TRIANGLES, 0, shape.vertices.length / 2);
            gl.uniform4f(program.u_color, ...shape.line_color);
            gl.uniform1ui(program.u_dashed, 0);
            gl.drawArrays(gl.LINE_STRIP, 0, shape.vertices.length / 2);
        }
    }
}

class GEscadaA extends GEscada_Base {
    get name(){ return 'Escada A'; }

    get skip(){ return 0; }
}

class GEscadaB extends GEscada_Base {
    get name(){ return 'Escada B'; }

    get skip(){ return GEscada_Base.divs/2; }
}

const Classes = {
    [GParede.name]: GParede,
    [GJanela.name]: GJanela,
    [GAbertura.name]: GAbertura,
    [GPorta.name]: GPorta,
    [GEscadaA.name]: GEscadaA,
    [GEscadaB.name]: GEscadaB,
};

function init(){
    gl.clearColor(1,1,1,1);
    gl.enable(gl.DEPTH_TEST);

    // inicializa e configura o object atlas
    {
        gl.bindTexture(gl.TEXTURE_2D, objectAtlas.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindRenderbuffer(gl.RENDERBUFFER, objectAtlas.depthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, objectAtlas.frameBuffer);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, objectAtlas.texture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, objectAtlas.depthBuffer);

        objectAtlas.resize();

        gl.clearColor(1,1,1,1);
        gl.enable(gl.DEPTH_TEST);
    }

    // carrega os shaders
    const vertex_shader = getShader('vertex-shader');
    const fragment_shader = getShader('fragment-shader');
    const fragment_shader_atlas = getShader('fragment-shader-atlas');

    gl.attachShader(default_program, vertex_shader);
    gl.attachShader(objectAtlas.program, vertex_shader);

    gl.attachShader(default_program, fragment_shader);
    gl.attachShader(objectAtlas.program, fragment_shader_atlas);

    gl.linkProgram(default_program);

    if (!gl.getProgramParameter(default_program, gl.LINK_STATUS))
        console.error('Could not initialize shaders (default)');

    gl.linkProgram(objectAtlas.program);

    if (!gl.getProgramParameter(objectAtlas.program, gl.LINK_STATUS))
        console.error('Could not initialize shaders (atlas)');

    useProgram(default_program);

    {
        const program = default_program;

        program.u_screen_to_clip = gl.getUniformLocation(program, 'u_screen_to_clip');
        program.u_transform = gl.getUniformLocation(program, 'u_transform');
        program.u_color = gl.getUniformLocation(program, 'u_color');
        program.u_dashed = gl.getUniformLocation(program, 'u_dashed');
        program.a_position = gl.getAttribLocation(program, 'a_position');
    }

    {
        const program = objectAtlas.program;

        program.u_screen_to_clip = gl.getUniformLocation(program, 'u_screen_to_clip');
        program.u_transform = gl.getUniformLocation(program, 'u_transform');
        program.a_position = gl.getAttribLocation(program, 'a_position');

        program.u_id = gl.getUniformLocation(program, 'u_id');
    }

    // demo
    
    // objects.push(new GParede(0,0,.15,2));
    // objects[0].rotation = Math.PI / 2;

    // objects.push(new GJanela(-.75,0));
    // objects[1].rotation = Math.PI / 2;

    // objects.push(new GAbertura(.75,0));
    // objects[2].rotation = Math.PI / 2;

    // objects.push(new GPorta(0,1.5));

    // objects.push(new GEscadaA(-1,-2.5));

    // objects.push(new GEscadaB(1,-2.5));
}

function draw(){
    if(!should_invalidate)
        return;
    should_invalidate = false;

    if(gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight){
        gl.canvas.width = gl.canvas.clientWidth;
        gl.canvas.height = gl.canvas.clientHeight;

        objectAtlas.resize();
    }
    
    // corrige o aspect ratio do canvas (= permite canvas com aspect ratios diferente de 1:1)
    const aspect_ratio_fix = mat4.fromScaling(mat4.create(), [
        gl.drawingBufferWidth > gl.drawingBufferHeight ? gl.drawingBufferHeight / gl.drawingBufferWidth : 1,
        gl.drawingBufferWidth < gl.drawingBufferHeight ?  gl.drawingBufferWidth / gl.drawingBufferHeight : 1,
        1 
    ]);

    // aplica um fator de escala global, de modo que escala_pixels_por_metro seja válida
    const screen_to_clip_scalar = config.escala_pixels_por_metro / Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight);
    const screen_to_clip = mat4.fromScaling(mat4.create(), [ screen_to_clip_scalar, screen_to_clip_scalar, 1 ]);

    // computa a matriz de transformação combinada que converte do screen space para o clip space
    const u_screen_to_clip = mat4.mul(mat4.create(), aspect_ratio_fix, screen_to_clip);
    
    const sorted_objects = Array.from(objects).sort((a,b) => b.layer - a.layer);


    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    useProgram(default_program);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.uniformMatrix4fv(program.u_screen_to_clip, false, u_screen_to_clip);

    for(let obj of sorted_objects)
        obj.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, objectAtlas.frameBuffer);
    useProgram(objectAtlas.program);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.uniformMatrix4fv(program.u_screen_to_clip, false, u_screen_to_clip);

    for(let obj of sorted_objects)
        obj.draw();
}

init();

// draw loop
{
    function cb(){ draw(); requestAnimationFrame(cb); }
    requestAnimationFrame(cb);
}

// redraw when canvas size changes
(new ResizeObserver(() => should_invalidate = true)).observe(gl.canvas, {box: 'content-box'});

// setup GUI
let updateStatus = txt => {};
{
    const gui_status = gui.add({ 'a': () => {} }, 'a');
    updateStatus = txt => gui_status.domElement.parentElement.querySelector('.property-name').innerText = txt;
    gui_status.domElement.parentElement.parentElement.style = 'pointer-events:none!important;cursor:default!important;border-left: 3px solid #CCC';
    gui_status.domElement.parentElement.parentElement.querySelector('.c').style += ';display:none!important';
    gui_status.domElement.parentElement.parentElement.querySelector('.property-name').style += ';width:100%';
    updateStatus('');
}

const gui_config = gui.addFolder('Configurações');
const gui_config_escala_pixels_por_metro = { get 'Escala (pixels/m)'(){ return config.escala_pixels_por_metro; }, set 'Escala (pixels/m)'(v){ config.escala_pixels_por_metro = v; should_invalidate = true; } }
gui_config.add(gui_config_escala_pixels_por_metro, 'Escala (pixels/m)', 1);
const gui_config_camera_x = { get 'Câmera x'(){ return config.camera_position[0]; }, set 'Câmera x'(v){ moveCamera(v); } }
gui_config.add(gui_config_camera_x, 'Câmera x', null, null, 0.5);
const gui_config_camera_y = { get 'Câmera y'(){ return config.camera_position[1]; }, set 'Câmera y'(v){ moveCamera(null, v); } }
gui_config.add(gui_config_camera_y, 'Câmera y', null, null, 0.5);

/**
 * @param {number} x 
 * @param {number} y 
 */
 function moveCamera(x = null, y = null){
    if(x != null)
        config.camera_position[0] = x;
    if(y != null)
        config.camera_position[1] = y;
    should_invalidate = true;
    gui_config.updateDisplay();
}

const gui_add = gui.addFolder('Elementos');
const gui_add_parede = { 'Adicionar Parede': () => {
    objects.push(new GParede(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_parede, 'Adicionar Parede');
const gui_add_janela = { 'Adicionar Janela': () => {
    objects.push(new GJanela(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_janela, 'Adicionar Janela');
const gui_add_abertura = { 'Adicionar Abertura': () => {
    objects.push(new GAbertura(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_abertura, 'Adicionar Abertura');
const gui_add_porta = { 'Adicionar Porta': () => {
    objects.push(new GPorta(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_porta, 'Adicionar Porta');
const gui_add_escada_a = { 'Adicionar Escada A': () => {
    objects.push(new GEscadaA(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_escada_a, 'Adicionar Escada A');
const gui_add_escada_b = { 'Adicionar Escada B': () => {
    objects.push(new GEscadaB(0,0));
    should_invalidate = true;
} };
gui_add.add(gui_add_escada_b, 'Adicionar Escada B');

function getMouseCanvasPos(clientX, clientY){
    return [ clientX - canvas.offsetLeft, clientY - canvas.offsetTop ];
}

function canvas2World(x, y){
    return [
        ((x / gl.drawingBufferWidth) * 2 - 1) * (gl.drawingBufferWidth / config.escala_pixels_por_metro) + config.camera_position[0],
        ((y / gl.drawingBufferHeight) * -2 + 1) * (gl.drawingBufferHeight / config.escala_pixels_por_metro) + config.camera_position[1],
    ];
}

function pointMeetingObject(x,y){
    const _fb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, objectAtlas.frameBuffer);
        
        const data = new Uint8Array(4);
        gl.readPixels(x, gl.drawingBufferHeight - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);

        const id = objectAtlas.idFromColor(data);

        if(id === 0xFFFFFFFF)
            return null;
        return objects.find(x => x.id === id) || null;
    }
    finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, _fb);
    }
}

async function readFile(){
    return new Promise((resolve) => {
        if(readFile.reject)
            readFile.reject();
        readFile.reject = () => resolve(null);
        const finput = document.querySelector('#file-input');
        finput.onchange = () => {
            readFile.reject = null;
            finput.onchange = null;

            const file = finput.files[0];
            if(!file)
                return resolve(null);

            const reader = new FileReader();
            reader.addEventListener('load', e => resolve(e.target.result));

            reader.readAsText(file);
        }
        finput.value = null;
        finput.click();
    });
}

const actions = {
    /**
     * Rotaciona o objeto
     * @param {GObject} obj 
     * @param {number} dir direção (-1 ou 1)
     */
    rotate(obj, dir){
        obj.rotation += (Math.PI / 2) * Math.sign(dir);
        obj.rotation = obj.rotation % (2 * Math.PI);
        should_invalidate = true;
    },
    /** @param {GObject} obj */
    delete(obj){
        objects.splice(objects.indexOf(obj), 1);
        obj.cleanup();
        should_invalidate = true;
    },
    /** @param {GObject} obj */
    clone(obj){
        const _class = obj.constructor;
        /** @type {GObject} */
        const cloned = new _class(0,0);

        cloned.load(obj.serialize());
        cloned.x = 0;
        cloned.y = 0;
        objects.push(cloned);

        should_invalidate = true;
    },
    /**
     * Rotaciona o objeto
     * @param {GObject} obj 
     * @param {number} eixo (x ou y)
     */
    flip(obj, eixo){
        obj.scale[eixo === 'x' ? 0 : 1] *= -1;
        should_invalidate = true;
    },
    /**
     * Rotaciona o objeto
     * @param {GObject} obj 
     * @param {string} propriedade
     */
    async alterarPropriedade(obj, propriedade, description = ''){
        const { value } = await swal.fire({
            title: `Alterar ${propriedade}`,
            input: 'text',
            inputLabel: propriedade[0].toUpperCase() + propriedade.substr(1) + description,
            inputPlaceholder: obj[propriedade],
            inputValue: obj[propriedade].toString().replace(/\./g, ','),
            showCancelButton: true,
            inputValidator: (value) => {
                let val = parseFloat(value.replace(/\,/g, '.'));
                if (isNaN(val))
                    return 'Valor inválido';
                if(val <= 0)
                    return 'Valor não pode ser zero';
            }
        });

        if(value){
            obj[propriedade] = parseFloat(value.replace(/\,/g, '.'));
            should_invalidate = true;
        }
    },
    async novoArquivo(quiet = false){
        if(!quiet && isUnsavedChanges()){
            const { value } = await swal.fire({
                icon: 'warning',
                title: 'Descartar modificações?',
                html: `
                    Seu projeto possui alterações não salvas. Se você continuar
                    elas serão <b>descartadas</b> e não será possível recuperá-las.
                    Prosseguir?
                `,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                showCancelButton: true,
                reverseButtons: true,
            });

            if(!value)
                return;
        }

        Object.assign(config, getDefaultConfig());
        gui_config.updateDisplay();

        for(let obj of Array.from(objects))
            actions.delete(obj);

        GObject.resetUid();

        should_invalidate = true;
    },
    async abrirArquivo(){
        const payload = await readFile();
        if(!payload)
            return;

        if(isUnsavedChanges()){
            const { value } = await swal.fire({
                icon: 'warning',
                title: 'Descartar modificações?',
                html: `
                    Seu projeto possui alterações não salvas. Se você continuar
                    elas serão <b>descartadas</b> e não será possível recuperá-las.
                    Prosseguir?
                `,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                showCancelButton: true,
                reverseButtons: true,
            });

            if(!value)
                return;
        }

        await this.novoArquivo(true);

        const serialized = JSON.parse(payload);
        
        Object.assign(config, serialized.config);
        gui_config.updateDisplay();

        for(let data of serialized.objects){
            const _class = Classes[data._type];
            const obj = new _class(0,0);
            obj.load(data);
            objects.push(obj);
        }

        should_invalidate = true;
    },
    async salvarArquivo(){
        const serialized = {
            config,
            objects: objects.map(x => x.serialize()),
        };
        const payload = JSON.stringify(serialized);

        saveAs(new Blob([payload], {type: 'text/plain;charset=utf-8'}), 'planta.json');
    },
};

function isUnsavedChanges(){
    const default_config = getDefaultConfig();
    for(let key in config){
        if(Array.isArray(default_config[key])){
            if(JSON.stringify(default_config[key]) !== JSON.stringify(config[key]))
                return true;
        }
        else if(default_config[key] !== config[key])
            return true;
    }

    if(objects.length > 0)
        return true;

    return false;
}

const gui_arquivo = gui.addFolder('Arquivo');
const gui_arquivo_novo = { 'Novo': () => actions.novoArquivo() };
gui_arquivo.add(gui_arquivo_novo, 'Novo');
const gui_arquivo_abrir = { 'Abrir': () => actions.abrirArquivo() };
gui_arquivo.add(gui_arquivo_abrir, 'Abrir');
const gui_arquivo_salvar = { 'Salvar': () => actions.salvarArquivo() };
gui_arquivo.add(gui_arquivo_salvar, 'Salvar');

// eventos do mouse
document.onmousemove = (ev) => {
    const [ x, y ] = getMouseCanvasPos(ev.clientX, ev.clientY);
    if(mouse.dragging || mouse.dragging_camera){
        const [ wx, wy ] = canvas2World(x, y);
        
        if(mouse.dragging){
            mouse.dragging.x = wx;
            mouse.dragging.y = wy;
        }
        else if(mouse.dragging_camera){
            const offset_world = [
                (x - mouse.dragging_camera.initial_position_screen_space[0]) / config.escala_pixels_por_metro,
                (y - mouse.dragging_camera.initial_position_screen_space[1]) / config.escala_pixels_por_metro,
            ];
            const new_pos = [
                mouse.dragging_camera.initial_position_world[0] - offset_world[0],
                mouse.dragging_camera.initial_position_world[1] + offset_world[1],
            ];
            moveCamera(...new_pos);
        }

        should_invalidate = true;
    }

    const _x = Math.min(Math.max(0,x), gl.drawingBufferWidth);
    const _y = Math.min(Math.max(0,y), gl.drawingBufferHeight);
    const [ _wx, _wy ] = canvas2World(_x, _y);
    updateStatus(`${_wx.toPrecision(3)}, ${_wy.toPrecision(3)}` + (mouse.dragging ? ` (${mouse.dragging.name})` : ''));
};
document.onmousedown = (ev) => {
    if(swal.isVisible())
        return;

    const [ x, y ] = getMouseCanvasPos(ev.clientX, ev.clientY);
    if(x < 0 || x > gl.drawingBufferWidth || y < 0 || y > gl.drawingBufferHeight)
        return;

    if(ev.button === 0){
        const obj = pointMeetingObject(x, y);
        if(obj)
            mouse.dragging = obj;
        else if(ev.ctrlKey)
            mouse.dragging_camera = { initial_position_screen_space: [ x, y ], initial_position_world: Array.from(config.camera_position) };
    }
    else if(ev.button === 1){
        mouse.dragging_camera = { initial_position_screen_space: [ x, y ], initial_position_world: Array.from(config.camera_position) };
    }

    document.onmousemove(ev);
};
document.onmouseup = (ev) => {
    if(swal.isVisible())
        return;

    document.onmousemove(ev);

    const [ x, y ] = getMouseCanvasPos(ev.clientX, ev.clientY);

    if(mouse.dragging_camera && (ev.button === 0 || ev.button === 1)){
        mouse.dragging_camera = null;
    }
    else if(ev.button === 0){
        if(mouse.dragging)
            mouse.dragging = null;
    }
    else if(ev.button === 2){
        const outside = x < 0 || x > gl.drawingBufferWidth || y < 0 || y > gl.drawingBufferHeight;
        if(!outside){
            const obj = pointMeetingObject(x, y);
            if(obj){
                ctxmenu.show([
                    { text: obj.name },
                    { isDivider: true },
                    {
                        text: 'Alterar',
                        subMenu: [
                            {
                                text: 'Espessura',
                                action: () => actions.alterarPropriedade(obj, 'espessura', ' (em metros)'),
                            },
                            {
                                text: 'Comprimento',
                                action: () => actions.alterarPropriedade(obj, 'comprimento', ' (em metros)'),
                            },
                        ],
                    },
                    {
                        text: 'Rotacionar',
                        subMenu: [
                            {
                                text: '90° horário',
                                action: () => actions.rotate(obj, 1),
                            },
                            {
                                text: '90° anti-horário',
                                action: () => actions.rotate(obj, -1),
                            },
                        ],
                    },
                    {
                        text: 'Espelhar',
                        subMenu: [
                            {
                                text: 'Horizontalmente',
                                action: () => actions.flip(obj, 'x'),
                            },
                            {
                                text: 'Verticalmente',
                                action: () => actions.flip(obj, 'y'),
                            },
                        ],
                    },
                    {
                        text: 'Clonar',
                        action: () => actions.clone(obj),
                    },
                    { isDivider: true },
                    {
                        text: 'Excluir',
                        action: () => actions.delete(obj),
                    },
                ], ev);
            }
        }
    }
};
document.onwheel = (ev) => {
    if(swal.isVisible())
        return;

    if(mouse.dragging)
        actions.rotate(mouse.dragging, Math.sign(ev.deltaY));
};
document.onkeyup = (ev) => {
    if(swal.isVisible())
        return;

    console.log(ev.key);
    if(mouse.dragging){
        switch(ev.key){
            case 'r':
                actions.rotate(mouse.dragging, 1);
                break;
        }
    }
    else {
        switch(ev.key){
            case 'ArrowLeft':
                moveCamera(config.camera_position[0] - .5);
                break;
            case 'ArrowRight':
                moveCamera(config.camera_position[0] + .5);
                break;
            case 'ArrowUp':
                moveCamera(null, config.camera_position[1] + .5);
                break;
            case 'ArrowDown':
                moveCamera(null, config.camera_position[1] - .5);
                break;
        }
    }
}

const gui_ajuda = gui.addFolder('Ajuda');
const gui_ajuda_ver_ajuda = { 'Ver ajuda': () => swal.fire({
    title: 'Ajuda',
    showConfirmButton: false,
    showCloseButton: true,
    html: `
        <div class="help">
            <b>Hotkeys:</b><br>
            <ul>
                <li>
                    <b>Adicionar objeto</b>:<br>
                    Elementos &gt; Adicionar [...]
                </li>
                <li>
                    <b>Transladar objeto</b>:<br>
                    Clique no objeto com o botão esquerdo do mouse e arraste-o
                </li>
                <li>
                    <b>Rotacionar objeto</b>:<br>
                    Clique no objeto com o botão direito do mouse &gt; Rotacionar<br><br>
                    Ou alternativamente:
                    <ul>
                        <li>Clique no objeto com o botão esquerdo do mouse, e enquanto segura o botão aperte a tecla R</li>
                        <li>Clique no objeto com o botão esquerdo do mouse, e enquanto segura o botão gire a scroll wheel do mouse</li>
                    </ul>
                </li>
                <li>
                    <b>Espelhar objeto</b>:<br>
                    Clique no objeto com o botão direito do mouse &gt; Alterar > Espelhar
                </li>
                <li>
                    <b>Redimensionar objeto</b>:<br>
                    Clique no objeto com o botão direito do mouse &gt; Alterar > Espessura/Comprimento<br><br>

                    (internamente esta funcionalidade é implementada utilizando escala)
                </li>
                <li>
                    <b>Clonar objeto</b>:<br>
                    Clique no objeto com o botão direito do mouse &gt; Alterar > Clonar
                </li>
                <li>
                    <b>Excluir objeto</b>:<br>
                    Clique no objeto com o botão direito do mouse &gt; Alterar > Excluir
                </li>
                <li>
                    <b>Alterar a escala de renderização</b> (a.k.a zoom):<br>
                    Configurações &gt; Escala (em pixels/metro)
                </li>
                <li>
                    <b>Mover a câmera</b>:<br>
                    Configurações &gt; Câmera x / y<br><br>
                    Ou alternativamente:
                    <ul>
                        <li>Clique e segure o botão do meio do mouse enquanto desloca o mouse</li>
                        <li>Aperte e segure CTRL, e então clique e segure o botão do esquerdo do mouse enquanto desloca o mouse</li>
                        <li>Aperte qualquer uma das setas do teclado</li>
                    </ul>
                </li>
            </ul>
        </div>
    `,
}) };
gui_ajuda.add(gui_ajuda_ver_ajuda, 'Ver ajuda');
const gui_ajuda_sobre = { 'Sobre': () => swal.fire({
    title: 'Sobre',
    showConfirmButton: false,
    showCloseButton: true,
    html: `
        <b>Editor gráfico de plantas baixas</b><br>
        <hr>
        Universidade Federal Fluminense<br>
        Graduação em Ciência da Computação<br>
        Tópicos Especiais em Sistemas de Programação III<br>
        2021.2
        <hr>
        Patrick Motta Aragão Pissurno
    `,
}) };
gui_ajuda.add(gui_ajuda_sobre, 'Sobre');

// desativa o menu de contexto default do navegador quando dentro do canvas
document.oncontextmenu = ev => { const [ x, y ] = getMouseCanvasPos(ev.clientX, ev.clientY); return x < 0 || x > gl.drawingBufferWidth || y < 0 || y > gl.drawingBufferHeight };