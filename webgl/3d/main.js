
const glMatrix = (/** @type {import('gl-matrix')} */(window)).glMatrix;
const vec2 = (/** @type {import('gl-matrix')} */(window)).vec2,
      vec3 = (/** @type {import('gl-matrix')} */(window)).vec3,
      vec4 = (/** @type {import('gl-matrix')} */(window)).vec4,
      mat2 = (/** @type {import('gl-matrix')} */(window)).mat2,
      mat3 = (/** @type {import('gl-matrix')} */(window)).mat3,
      mat4 = (/** @type {import('gl-matrix')} */(window)).mat4,
      quat = (/** @type {import('gl-matrix')} */(window)).quat;

/** @type {import('dat.gui')} */
const dat = window.dat;

let updateStatus = txt => {};

/** @type { import('sweetalert2').default } */
const swal = window.swal;

const canvas = document.getElementById('canvas');

/** @type { WebGL2RenderingContext } */
const gl = canvas.getContext('webgl2');

const default_program = gl.createProgram();
const textured_program = gl.createProgram();
const programs = [ default_program, textured_program ];
const programs_data = new Map();

let program = default_program;

/** @param { WebGLProgram } _program */
function useProgram(_program){
    if(program === _program)
        return;

    gl.useProgram(_program);
    program = _program;

    if(programs_data.has(_program))
        programs_data.get(_program)();
}

const gui = new dat.GUI();

/** @type { Map<string, WebGLTexture> } */
const texture_cache = new Map();

const mouse = {
    /** @type {number} */
    x: null,
    /** @type {number} */
    y: null,
    lock: false,
    sensibilidade: [0.005, 0.005],
};

const keyboard = {
    left: false,
    right: false,
    up: false,
    down: false,
};

const getDefaultConfig = () => ({
    camera_position: [ 3, 0, -1 ],
    camera_local_speed: [ 0, 0, 0 ],
    camera_rotation: [ 0, 0, 0 ],
    camera_max_speed: 0.05,
    directional_light_direction: [-.55, -.85, -.2],
    ambient_light_intensity: [0.35, 0.35, 0.35],
    collision_bias: 0.1,
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

class Mesh {
    constructor(x, y, z, textured){
        this.x = x;
        this.y = y;
        this.z = z;
        this.scale = [1, 1, 1];

        const program = textured ? textured_program : default_program;
        
        /** quaternio de rotação */
        this.rotation = quat.create();

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.vertices = this.getTriangles();
        this.normals = this.getNormals();
        this.colors = textured ? null : this.getColors();
        this.tex_coords = textured ? this.getTexCoords() : null;
        
        /** @type {WebGLTexture} */
        this.texture = null;
        this.texture_scale = 1;
        this.texture_tiling = false;

        this.vbuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(program.a_position);
        gl.vertexAttribPointer(program.a_position, 3, gl.FLOAT, false, 0, 0);
        
        this.nbuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.normals), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(program.a_normal);
        gl.vertexAttribPointer(program.a_normal, 3, gl.FLOAT, false, 0, 0);

        /** @type { WebGLBuffer } */
        this.cbuffer = null;
        /** @type { WebGLBuffer } */
        this.tbuffer = null;
        
        if(textured){
            this.tbuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.tbuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.tex_coords), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(program.a_texcoord);
            gl.vertexAttribPointer(program.a_texcoord, 2, gl.FLOAT, false, 0, 0);
        }
        else {
            this.cbuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.colors), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(program.a_color);
            gl.vertexAttribPointer(program.a_color, 3, gl.FLOAT, false, 0, 0);
        }
    }

    /** retorna os triângulos no espaço do objeto */
    getTriangles(){ 
        return [];
    }

    /** retorna as normais para cada um dos vértices */
    getNormals(){
        const vertices = this.vertices ? this.vertices : this.getTriangles();
        const normals = [];
        for(let i = 0; i < vertices.length; i += 9){
            const vA = vec3.fromValues(vertices[i + 3] - vertices[i], vertices[i + 4] - vertices[i + 1], vertices[i + 5] - vertices[i + 2]);
            const vB = vec3.fromValues(vertices[i + 6] - vertices[i + 3], vertices[i + 7] - vertices[i + 4], vertices[i + 8] - vertices[i + 5]);
            const normal = vec3.cross(vec3.create(), vA, vB);
            vec3.normalize(normal, normal);
            normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);
        }
        return normals;
    }

    /** retorna as cores para cada um dos triângulos */
    getColors(){
        return [];
    }

    /** retorna o mapeamento (UVs) para texturas da mesh */
    getTexCoords(){
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
        if(this.nbuffer != null){
            gl.deleteBuffer(this.nbuffer);
            this.nbuffer = null;
        }
        if(this.cbuffer != null){
            gl.deleteBuffer(this.cbuffer);
            this.cbuffer = null;
        }
        if(this.tbuffer != null){
            gl.deleteBuffer(this.tbuffer);
            this.tbuffer = null;
        }
    }
}

class Parede extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z);
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getColors(){
        return [
            ...generateVertexColors(1,1,1, 36),
        ]
    }
}

class ChaoMadeira extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/wood.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/wood.jpg'); //cors
        this.texture_scale = .5;
        this.texture_tiling = true;
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['cube'].tex_coords
        ];
    }
}

class ChaoAzulejo extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/marble.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/marble.jpg'); //cors
        this.texture_scale = .5;
        this.texture_tiling = true;
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['cube'].tex_coords
        ];
    }
}

class ChaoLadrilho extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/marble-2.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/marble-2.jpg'); //cors
        this.texture_scale = .5;
        this.texture_tiling = true;
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['cube'].tex_coords
        ];
    }
}

class ChaoPisoBranco extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/tiles.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/tiles.jpg'); //cors
        this.texture_scale = .65;
        this.texture_tiling = true;
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['cube'].tex_coords
        ];
    }
}

class Teto extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z);
    }
    getTriangles(){ 
        return [
            ...Meshes['cube'].vertices,
        ];
    }
    getColors(){
        return [
            ...generateVertexColors(.75,.75,.75, 36),
        ]
    }
}

class Table extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/table.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/table.jpg'); //cors
    }
    getTriangles(){ 
        return [
            ...Meshes['table'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['table'].tex_coords
        ];
    }
    getNormals(){
        return [
            ...Meshes['table'].normals,
        ];
    }
}

class Chair extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/chair.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/chair.jpg'); //cors
    }
    getTriangles(){ 
        return [
            ...Meshes['chair'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['chair'].tex_coords
        ];
    }
    getNormals(){
        return [
            ...Meshes['chair'].normals,
        ];
    }
}

class Sink extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z);
    }
    getTriangles(){ 
        return [
            ...Meshes['sink'].vertices,
        ];
    }
    getColors(){
        return [
            ...generateVertexColors(.75,.85,.95, this.vertices.length),
        ]
    }
    getNormals(){
        return [
            ...Meshes['sink'].normals,
        ];
    }
}

class Fridge extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/fridge.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/fridge.jpg'); //cors
    }
    getTriangles(){ 
        return [
            ...Meshes['fridge'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['fridge'].tex_coords
        ];
    }
    getNormals(){
        return [
            ...Meshes['fridge'].normals,
        ];
    }
}

class Bed extends Mesh {
    constructor(x, y, z){ //unidade em metros
        super(x, y, z, true);
        // this.texture = loadTexture('./textures/bed.jpg'); //cors
        this.texture = loadTexture('https://patrickpissurno.com.br/webgl/3d/textures/bed.jpg'); //cors
    }
    getTriangles(){ 
        return [
            ...Meshes['bed'].vertices,
        ];
    }
    getTexCoords(){
        return [
            ...Meshes['bed'].tex_coords
        ];
    }
    getNormals(){
        return [
            ...Meshes['bed'].normals,
        ];
    }
}

class GObject {
    static _uid = 0 >>> 0;
    static resetUid(){ GObject._uid = 0 >>> 0; }

    constructor(x, y, z){
        /** @type {Mesh[]} */
        this.meshes = [];

        this.x = x;
        this.y = y;
        this.z = z;
        this.scale = [1, 1, 1];
        
        this.solid = false;
        this.invalidate_aabb = true;
        this.aabb = {
            /** @type {number} */
            min_x: null,
            /** @type {number} */
            max_x: null,
            /** @type {number} */
            min_y: null,
            /** @type {number} */
            max_y: null,
            /** @type {number} */
            min_z: null,
            /** @type {number} */
            max_z: null,
        };

        /** quaternio de rotação */
        this.rotation = quat.create();

        this.id = GObject._uid++;
    }

    get name(){ return 'Objeto'; }

    computeTransform(){
        const scale = mat4.fromScaling(mat4.create(), this.scale);

        const translation = mat4.fromValues(
            1, 0, 0, this.x,
            0, 1, 0, this.y,
            0, 0, 1, this.z,
            0, 0, 0, 1,
        );

        const rotation = mat4.fromQuat(mat4.create(), this.rotation);

        const transform = mat4.identity(mat4.create());
        mat4.mul(transform, transform, scale);
        mat4.mul(transform, transform, rotation);
        mat4.mul(transform, transform, translation);

        return transform;
    }

    /** @param {Mesh} mesh */
    computeMeshTransform(mesh, parent_transform = mat4.identity(mat4.create())){
        const scale = mat4.fromScaling(mat4.create(), mesh.scale);

        const translation = mat4.fromValues(
            1, 0, 0, mesh.x,
            0, 1, 0, mesh.y,
            0, 0, 1, mesh.z,
            0, 0, 0, 1,
        );

        const rotation = mat4.fromQuat(mat4.create(), mesh.rotation);

        const transform = mat4.identity(mat4.create());
        mat4.mul(transform, transform, scale);
        mat4.mul(transform, transform, rotation);
        mat4.mul(transform, transform, translation);
        mat4.mul(transform, transform, parent_transform);

        return transform;
    }

    computeAABB(){
        const vertex = vec3.create();
        const transform = this.computeTransform();
        for(let mesh of this.meshes){
            const mesh_transform = this.computeMeshTransform(mesh, transform);
            mat4.transpose(mesh_transform, mesh_transform);
            for(let i = 0; i < mesh.vertices.length - 1; i += 3){
                vertex[0] = mesh.vertices[i];
                vertex[1] = mesh.vertices[i + 1];
                vertex[2] = mesh.vertices[i + 2];
                vec3.transformMat4(vertex, vertex, mesh_transform);

                if(this.aabb.min_x == null || vertex[0] < this.aabb.min_x)
                    this.aabb.min_x = vertex[0];
                if(this.aabb.max_x == null || vertex[0] > this.aabb.max_x)
                    this.aabb.max_x = vertex[0];

                if(this.aabb.min_y == null || vertex[1] < this.aabb.min_y)
                    this.aabb.min_y = vertex[1];
                if(this.aabb.max_y == null || vertex[1] > this.aabb.max_y)
                    this.aabb.max_y = vertex[1];

                if(this.aabb.min_z == null || vertex[2] < this.aabb.min_z)
                    this.aabb.min_z = vertex[2];
                if(this.aabb.max_z == null || vertex[2] > this.aabb.max_z)
                    this.aabb.max_z = vertex[2];
            }
        }
        this.invalidate_aabb = false;
        return this.aabb;
    }

    draw(){
        const transform = this.computeTransform();

        for(let i = 0; i < this.meshes.length; i++){
            this.prepareDrawMesh(i, transform);
            this.drawMesh(i);
        }
    }

    prepareDrawMesh(index, parent_transform = mat4.identity(mat4.create())){
        const mesh = this.meshes[index];

        if(mesh.texture != null)
            useProgram(textured_program);
        else
            useProgram(default_program);

        gl.bindVertexArray(mesh.vao);

        const transform = this.computeMeshTransform(mesh, parent_transform);
        const transform_inverse_transpose = mat4.invert(mat4.create(), transform);
        mat4.transpose(transform_inverse_transpose, transform_inverse_transpose);

        gl.uniformMatrix4fv(program.u_transform, false, transform);
        gl.uniformMatrix4fv(program.u_transform_inverse_transpose, false, transform_inverse_transpose);

        if(program === textured_program){
            // seleciona a unit 0 da textura
            gl.activeTexture(gl.TEXTURE0);

            // faz o bind da textura no unit 0
            gl.bindTexture(gl.TEXTURE_2D, mesh.texture);

            // configura para carregar a textura do unit 0
            gl.uniform1i(program.u_texture, 0);

            gl.uniform1f(program.u_texture_scale, mesh.texture_scale);
            gl.uniform1f(program.u_texture_tiling, +mesh.texture_tiling);
        }
    }

    drawMesh(index){
        const mesh = this.meshes[index];
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
    }

    cleanup(){
        for(let mesh of this.meshes)
            mesh.cleanup();
    }
}

class GParede extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Parede(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Parede'; }
}

class GChaoMadeira extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.meshes.push(new ChaoMadeira(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Chão (madeira)'; }
}

class GChaoAzulejo extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.meshes.push(new ChaoAzulejo(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Chão (azulejo)'; }
}

class GChaoLadrilho extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.meshes.push(new ChaoLadrilho(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Chão (ladrilho)'; }
}

class GChaoPisoBranco extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.meshes.push(new ChaoPisoBranco(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Chão (piso branco)'; }
}

class GTeto extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.meshes.push(new Teto(-.5, -.5, -.5)); //offset
    }

    get name(){ return 'Chão (piso branco)'; }
}

class GTable extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Table(0, 0, 0)); //offset
    }

    get name(){ return 'Table'; }
}

class GChair extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Chair(0, 0, 0)); //offset
    }

    get name(){ return 'Chair'; }
}

class GSink extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Sink(0, 0, 0)); //offset
    }

    get name(){ return 'Sink'; }
}

class GFridge extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Fridge(0, 0, 0)); //offset
    }

    get name(){ return 'Fridge'; }
}

class GBed extends GObject {
    constructor(x, y, z){
        super(x, y, z);
        this.solid = true;
        this.meshes.push(new Bed(0, 0, 0)); //offset
    }

    get name(){ return 'Bed'; }
}

const Classes = {
    [GParede.name]: GParede,
    [GChaoMadeira.name]: GChaoMadeira,
    [GChaoAzulejo.name]: GChaoAzulejo,
    [GChaoLadrilho.name]: GChaoLadrilho,
    [GChaoPisoBranco.name]: GChaoPisoBranco,
    [GTeto.name]: GTeto,
    [GTable.name]: GTable,
};

function init(){
    gl.clearColor(1,1,1,1);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);

    // carrega os shaders
    const vertex_shader = getShader('vertex-shader');
    const vertex_shader_textured = getShader('vertex-shader-textured');
    const fragment_shader = getShader('fragment-shader');
    const fragment_shader_textured = getShader('fragment-shader-textured');

    gl.attachShader(default_program, vertex_shader);
    gl.attachShader(textured_program, vertex_shader_textured);

    gl.attachShader(default_program, fragment_shader);
    gl.attachShader(textured_program, fragment_shader_textured);

    gl.linkProgram(default_program);

    if (!gl.getProgramParameter(default_program, gl.LINK_STATUS))
        console.error('Could not initialize shaders (default)');

    gl.linkProgram(textured_program);

    if (!gl.getProgramParameter(textured_program, gl.LINK_STATUS))
        console.error('Could not initialize shaders (textured)');

    useProgram(default_program);

    for(let program of programs){
        program.u_projection = gl.getUniformLocation(program, 'u_projection');
        program.u_camera_transform = gl.getUniformLocation(program, 'u_camera_transform');
        program.u_transform = gl.getUniformLocation(program, 'u_transform');
        program.u_transform_inverse_transpose = gl.getUniformLocation(program, 'u_transform_inverse_transpose');
        program.u_ambient_light = gl.getUniformLocation(program, 'u_ambient_light');
        program.u_direct_light = gl.getUniformLocation(program, 'u_direct_light');
        program.a_position = gl.getAttribLocation(program, 'a_position');
        program.a_normal = gl.getAttribLocation(program, 'a_normal');

        if(program === default_program){
            program.a_color = gl.getAttribLocation(program, 'a_color');
        }
        else if(program === textured_program){
            program.u_texture = gl.getUniformLocation(program, 'u_texture');
            program.u_texture_scale = gl.getUniformLocation(program, 'u_texture_scale');
            program.u_texture_tiling = gl.getUniformLocation(program, 'u_texture_tiling');
            program.a_texcoord = gl.getAttribLocation(program, 'a_texcoord');
        }
    }
    
    // demo
    objects.push(new GParede(0, 0, -2));
    objects[objects.length - 1].scale = [.15, 2.5, 5];
    objects.push(new GParede(6.5, 0, -2));
    objects[objects.length - 1].scale = [.15, 2.5, 5];
    objects.push(new GParede(2 - .15, 0, -4.5));
    objects[objects.length - 1].scale = [4, 2.5, .15];
    objects.push(new GParede(3.25, 0, .55));
    objects[objects.length - 1].scale = [7, 2.5, .15];

    objects.push(new GParede(0, 0, -6));
    objects[objects.length - 1].scale = [.15, 2.5, 3];
    objects.push(new GParede(8.75, 0, -4.5));
    objects[objects.length - 1].scale = [7, 2.5, .15];
    objects.push(new GParede(3.775, 0, -5));
    objects[objects.length - 1].scale = [.15, 2.5, 1];
    objects.push(new GParede(3.775, 0, -7));
    objects[objects.length - 1].scale = [.15, 2.5, 1];
    objects.push(new GParede(2 - .15, 0, -7.5));
    objects[objects.length - 1].scale = [4, 2.5, .15];

    objects.push(new GParede(5.3275, 0, -5));
    objects[objects.length - 1].scale = [.15, 2.5, 1];
    objects.push(new GParede(5.3275, 0, -7));
    objects[objects.length - 1].scale = [.15, 2.5, 1];
    objects.push(new GParede(12, 0, -6));
    objects[objects.length - 1].scale = [.15, 2.5, 3];

    objects.push(new GParede(8.75, 0, -7.5));
    objects[objects.length - 1].scale = [7, 2.5, .15];
    objects.push(new GParede(8.5, 0, -9.5));
    objects[objects.length - 1].scale = [.15, 2.5, 4];
    objects.push(new GParede(0, 0, -9.5));
    objects[objects.length - 1].scale = [.15, 2.5, 4];
    objects.push(new GParede(4.3, 0, -11.55));
    objects[objects.length - 1].scale = [8.5, 2.5, .15];

    objects.push(new GChaoMadeira(4, -1.3, -1.95));
    objects[objects.length - 1].scale = [8.5, 0.15, 4.95];

    objects.push(new GChaoAzulejo(1.92, -1.3, -6));
    objects[objects.length - 1].scale = [3.85, 0.15, 3.1];

    objects.push(new GChaoLadrilho(8.63, -1.3, -6));
    objects[objects.length - 1].scale = [6.75, 0.15, 3.1];

    objects.push(new GChaoMadeira(4.55, -1.3, -6));
    objects[objects.length - 1].scale = [1.42, 0.15, 3.15];

    objects.push(new GChaoPisoBranco(4.22, -1.3, -9.52));
    objects[objects.length - 1].scale = [8.5, 0.15, 3.9];

    objects.push(new GTeto(6, 1.3, -5.52));
    objects[objects.length - 1].scale = [12, 0.15, 12];
    
    objects.push(new GTable(1, -1.1, -1));

    objects.push(new GChair(1.75, -1.225, -1));
    objects[objects.length - 1].scale = [1.1,1.1,1.1];
    quat.rotateY(objects[objects.length - 1].rotation, objects[objects.length - 1].rotation, Math.PI/2);

    objects.push(new GChair(1.1, -1.225, -2.5));
    objects[objects.length - 1].scale = [1.1,1.1,1.1];

    objects.push(new GSink(2.75, -1.2, -7));
    objects[objects.length - 1].scale = [.5,.5,.5];

    objects.push(new GFridge(5.9, -1.25, -7));
    objects[objects.length - 1].scale = [.375,.375,.375];
    quat.rotateY(objects[objects.length - 1].rotation, objects[objects.length - 1].rotation, Math.PI/2);

    objects.push(new GBed(1.2, -1.19, -10.1));
    objects[objects.length - 1].scale = [20,20,20];
    quat.rotateY(objects[objects.length - 1].rotation, objects[objects.length - 1].rotation, Math.PI);
}

function draw(){
    if(!should_invalidate)
        return;
    should_invalidate = false;

    if(gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight){
        gl.canvas.width = gl.canvas.clientWidth;
        gl.canvas.height = gl.canvas.clientHeight;
    }

    // avança na simulação
    update();

    // matriz de transformação da camera
    const u_camera_transform = mat4.identity(mat4.create());
    const camera_position = vec3.fromValues(...config.camera_position);
    vec3.scale(camera_position, camera_position, -1);
    mat4.rotateX(u_camera_transform, u_camera_transform, config.camera_rotation[0]);
    mat4.rotateY(u_camera_transform, u_camera_transform, config.camera_rotation[1]);
    mat4.rotateZ(u_camera_transform, u_camera_transform, config.camera_rotation[2]);
    mat4.translate(u_camera_transform, u_camera_transform, camera_position);

    // matriz de projeção
    const u_projection = mat4.perspective(mat4.create(), Math.PI/3, gl.canvas.clientWidth/gl.canvas.clientHeight, 0.001, 2000); //perspectiva
    
    gl.enable(gl.CULL_FACE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    useProgram(null);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    for(let program of programs){
        programs_data.set(program, () => {
            gl.uniformMatrix4fv(program.u_projection, false, u_projection);
            gl.uniformMatrix4fv(program.u_camera_transform, false, u_camera_transform);

            // luz ambiente
            gl.uniform3f(program.u_ambient_light, ...config.ambient_light_intensity);

            // luz direcional
            gl.uniform3f(program.u_direct_light, ...config.directional_light_direction);
        });
    }

    for(let obj of objects)
        obj.draw();
}

// inverte o cubo que construí na mão, pois ele é CW e o programa é CCW
{
    window.Meshes.cube.vertices = reverseVertices(window.Meshes.cube.vertices);
    window.Meshes.cube.tex_coords = reverseVertices(window.Meshes.cube.tex_coords, 2);
}

parseObjMeshes();

init();

// draw loop
{
    function cb(){ draw(); requestAnimationFrame(cb); }
    requestAnimationFrame(cb);
}

// passo da simulação
function update(){
    should_invalidate = true;

    for(let obj of objects){
        if(obj.solid && obj.invalidate_aabb)
            obj.computeAABB();
    }

    config.camera_local_speed[0] = keyboard.left * -1 + keyboard.right;
    config.camera_local_speed[2] = keyboard.up * -1 + keyboard.down;

    const camera_world_speed = vec3.fromValues(...config.camera_local_speed);
    vec3.scale(camera_world_speed, camera_world_speed, config.camera_max_speed);

    // converte a velocidade dos eixos locais da câmera para os eixos do mundo
    const u_camera_transform = mat4.identity(mat4.create());
    mat4.rotateY(u_camera_transform, u_camera_transform, -config.camera_rotation[1]);
    vec3.transformMat4(camera_world_speed, camera_world_speed, u_camera_transform);

    const ycol = config.camera_position[1] - .5; //checa a colisão mais perto do chão

    if(checkCollision(config.camera_position[0] + camera_world_speed[0], ycol, config.camera_position[2]))
        camera_world_speed[0] = 0;

    if(checkCollision(config.camera_position[0], ycol, config.camera_position[2] + camera_world_speed[2]))
        camera_world_speed[2] = 0;

    for(let i = 0; i < 3; i++)
        config.camera_position[i] += camera_world_speed[i];

    updateStatus(`Posição: (${config.camera_position.map(x => x.toFixed(2)).join(', ')})`);
}

// redraw when canvas size changes
(new ResizeObserver(() => should_invalidate = true)).observe(gl.canvas, {box: 'content-box'});

/**
 * 
 * @param {number} r red
 * @param {number} g green
 * @param {number} b blue
 * @param {number} count número de vértices
 */
function generateVertexColors(r, g, b, count){
    const result = [];
    for(let i = 0; i < count; i++){
        result.push(r);
        result.push(g);
        result.push(b);
    }
    return result;
}

/** @param {string} url */
function loadTexture(url){
    if(texture_cache.has(url))
        return texture_cache.get(url);

    const texture = gl.createTexture();
    texture_cache.set(texture);

    // seleciona a unit 0 da textura
    gl.activeTexture(gl.TEXTURE0);

    // inicializa a textura como um pixel magenta (placeholder enquanto carrega a imagem)
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
    
    const image = new Image();
    image.addEventListener('load', () => {
        // atualiza a textura com a imagem definitiva
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
    });
    image.crossOrigin = '';
    image.src = url;

    return texture;
}

function getMouseCanvasPos(clientX, clientY){
    return [ clientX - canvas.offsetLeft, clientY - canvas.offsetTop ];
}

function checkCollision(x,y,z){
    const pt = vec3.fromValues(x,y,z);
    const closest = vec3.create();
    const squared_bias = config.collision_bias * config.collision_bias;

    for(let obj of objects){
        if(obj.solid){
            closest[0] = x > obj.aabb.max_x ? obj.aabb.max_x : (x < obj.aabb.min_x ? obj.aabb.min_x : x);
            closest[1] = y > obj.aabb.max_y ? obj.aabb.max_y : (y < obj.aabb.min_y ? obj.aabb.min_y : y);
            closest[2] = z > obj.aabb.max_z ? obj.aabb.max_z : (z < obj.aabb.min_z ? obj.aabb.min_z : z);
            const inside = vec3.squaredDistance(pt, closest) < squared_bias;

            if(inside)
                return true;
        }
    }
    return false;
}

/**
 * @param {KeyboardEvent} ev 
 * @param {boolean} pressed 
 */
function onKeyboard(ev, pressed){
    if(swal.isVisible() && !pressed)
        return;
    switch(ev.key){
        case 'w':
        case 'ArrowUp':
            keyboard.up = pressed;
            break;
        case 's':
        case 'ArrowDown':
            keyboard.down = pressed;
            break;
        case 'a':
        case 'ArrowLeft':
            keyboard.left = pressed;
            break;
        case 'd':
        case 'ArrowRight':
            keyboard.right = pressed;
            break;
    }
}

document.onkeydown = ev => onKeyboard(ev, true);
document.onkeyup = ev => onKeyboard(ev, false);

document.onmousemove = (ev) => {
    const [ x, y ] = getMouseCanvasPos(ev.clientX, ev.clientY);

    if(!swal.isVisible() && document.hasFocus() && mouse.x != null && mouse.y != null){
        const diff_x = document.pointerLockElement == canvas ? ev.movementX : x - mouse.x;
        const diff_y = document.pointerLockElement == canvas ? ev.movementY : y - mouse.y;

        const wx = diff_x * mouse.sensibilidade[0];
        const wy = diff_y * mouse.sensibilidade[1];

        // a limitação de rotação em torno do eixo x impede o gimbal lock
        config.camera_rotation[0] = Math.min(Math.max(config.camera_rotation[0] + wy, -Math.PI * 0.27), Math.PI * 0.27);
        config.camera_rotation[1] += wx;
    }

    mouse.x = x;
    mouse.y = y;
};

let first_click = true;
let disable_lock = false;
canvas.onclick = async () => {
    if(swal.isVisible())
        return;

    if(first_click){
        first_click = false;

        const { value } = await swal.fire({
            title: 'Ativar captura de cursor?',
            html: `
                Clicar na tela ativa a captura de cursor, que restringe o cursor à região da tela,
                permitindo o deslocamento à vontade do cursor do mouse. Para sair da captura de cursor,
                basta apertar <b>ESC</b>.<br><br>
                <b>ATENÇÃO:</b> a captura de cursor depende do suporte do navegador e enquanto desenvolvia
                percebi que quando estou nela às vezes o cursor fica "agarrando" (para de responder).<br><br>
                Caso isso aconteça, recomendo apertar <b>ESC</b> e utilizar sem a captura do cursor.
            `,
            confirmButtonText: 'Ativar',
            cancelButtonText: 'Desativar',
            showCancelButton: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
            reverseButtons: true,
        });

        disable_lock = !value;
    }

    if(!disable_lock)
        canvas.requestPointerLock();
};

function parseObjMeshes(){
    if(window.ObjMeshes == null)
        return;

    // https://webgl2fundamentals.org/webgl/lessons/webgl-load-obj.html
    for(let obj of window.ObjMeshes){
        const text = obj.data;

        // because indices are base 1 let's just fill in the 0th data
        const objPositions = [[0, 0, 0]];
        const objTexcoords = [[0, 0]];
        const objNormals = [[0, 0, 0]];

        // same order as `f` indices
        const objVertexData = [
            objPositions,
            objTexcoords,
            objNormals,
        ];

        // same order as `f` indices
        let webglVertexData = [
            [],   // positions
            [],   // texcoords
            [],   // normals
        ];

        function addVertex(vert) {
            const ptn = vert.split('/');
            ptn.forEach((objIndexStr, i) => {
                if (!objIndexStr) {
                    return;
                }
                const objIndex = parseInt(objIndexStr);
                const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
                webglVertexData[i].push(...objVertexData[i][index]);
            });
        }

        const keywords = {
            v(parts) {
                objPositions.push(parts.map(parseFloat));
            },
            vn(parts) {
                objNormals.push(parts.map(parseFloat));
            },
            vt(parts) {
                // should check for missing v and extra w?
                objTexcoords.push(parts.map(parseFloat));
            },
            f(parts) {
                const numTriangles = parts.length - 2;
                for (let tri = 0; tri < numTriangles; ++tri) {
                    addVertex(parts[0]);
                    addVertex(parts[tri + 1]);
                    addVertex(parts[tri + 2]);
                }
            },
        };

        const keywordRE = /(\w*)(?: )*(.*)/;
        const lines = text.split('\n');
        for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
            const line = lines[lineNo].trim();
            if (line === '' || line.startsWith('#')) {
                continue;
            }
            const m = keywordRE.exec(line);
            if (!m) {
                continue;
            }
            const [, keyword, unparsedArgs] = m;
            const parts = line.split(/\s+/).slice(1);
            const handler = keywords[keyword];
            if (!handler) {
                //console.warn('unhandled keyword:', keyword);
                continue;
            }
            handler(parts, unparsedArgs);
        }

        window.Meshes[obj.name] = {
            vertices: webglVertexData[0],
            tex_coords: webglVertexData[1],
            normals: webglVertexData[2],
        };
    }
}

function reverseVertices(vertices, size = 3){
    const result = [];
    for(let i = 0; i < vertices.length; i += size * 3){ //3 vértices por triangulo
        for(let v = 2; v >= 0; v--){
            for(let j = 0; j < size; j++)
                result.push(vertices[i + (v * 3) + j]);
        }
    }
    return result;
}

{
    const gui_status = gui.add({ 'a': () => {} }, 'a');
    updateStatus = txt => gui_status.domElement.parentElement.querySelector('.property-name').innerText = txt;
    gui_status.domElement.parentElement.parentElement.style = 'pointer-events:none!important;cursor:default!important;border-left: 3px solid #CCC';
    gui_status.domElement.parentElement.parentElement.querySelector('.c').style += ';display:none!important';
    gui_status.domElement.parentElement.parentElement.querySelector('.property-name').style += ';width:100%';
    updateStatus('');
}

const gui_config = gui.addFolder('Configurações');
const gui_config_camera_max_speed = { get 'Velocidade máx.'(){ return config.camera_max_speed * 60; }, set 'Velocidade máx.'(v){ config.camera_max_speed = v / 60; should_invalidate = true; } }
gui_config.add(gui_config_camera_max_speed, 'Velocidade máx.', 1);

const gui_config_luz_ambiente_r = { get 'Luz ambiente (R)'(){ return config.ambient_light_intensity[0]; }, set 'Luz ambiente (R)'(v){ config.ambient_light_intensity[0] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_ambiente_r, 'Luz ambiente (R)', 0, 1, 0.05);
const gui_config_luz_ambiente_g = { get 'Luz ambiente (G)'(){ return config.ambient_light_intensity[1]; }, set 'Luz ambiente (G)'(v){ config.ambient_light_intensity[1] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_ambiente_g, 'Luz ambiente (G)', 0, 1, 0.05);
const gui_config_luz_ambiente_b = { get 'Luz ambiente (B)'(){ return config.ambient_light_intensity[2]; }, set 'Luz ambiente (B)'(v){ config.ambient_light_intensity[2] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_ambiente_b, 'Luz ambiente (B)', 0, 1, 0.05);

const gui_config_luz_direcional_x = { get 'Luz direcion. (X)'(){ return config.directional_light_direction[0]; }, set 'Luz direcion. (X)'(v){ config.directional_light_direction[0] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_direcional_x, 'Luz direcion. (X)', -1, 1, 0.05);
const gui_config_luz_direcional_y = { get 'Luz direcion. (Y)'(){ return config.directional_light_direction[1]; }, set 'Luz direcion. (Y)'(v){ config.directional_light_direction[1] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_direcional_y, 'Luz direcion. (Y)', -1, 1, 0.05);
const gui_config_luz_direcional_z = { get 'Luz direcion. (Z)'(){ return config.directional_light_direction[2]; }, set 'Luz direcion. (Z)'(v){ config.directional_light_direction[2] = v; should_invalidate = true; } }
gui_config.add(gui_config_luz_direcional_z, 'Luz direcion. (Z)', -1, 1, 0.05);


const gui_ajuda = gui.addFolder('Ajuda');
const gui_ajuda_ver_ajuda = { 'Ver ajuda': () => swal.fire({
    title: 'Ajuda',
    showConfirmButton: false,
    showCloseButton: true,
    html: `
        <div class="help">
            <b>Controles:</b><br>
            <ul>
                <li>
                    <b>Mouse</b> (olhar):<br>
                    Mova verticalmente e/ou horizontalmente o cursor
                    para controlar para onde a câmera está apontando
                </li>
                <li>
                    <b>Teclado</b> (andar):<br>
                    <b>W</b> (frente) (ou <b>seta</b> para cima)<br>
                    <b>A</b> (esquerda) (ou <b>seta</b> para esquerda)<br>
                    <b>S</b> (trás) (ou <b>seta</b> para baixo)<br>
                    <b>D</b> (direita) (ou <b>seta</b> para direita)<br>
                </li>
                <li>
                    <b>Capturar cursor</b>:<br>
                    Clique com o <b>botão esquerdo</b> do mouse para capturar o cursor.
                    Aperte <b>ESC</b> para sair da captura de cursor.
                </li>
                <li>
                    <b>Tela cheia</b>:<br>
                    Aperte <b>F11</b> para entrar em tela cheia.<br>
                    Aperte <b>F11</b> novamente sair da tela cheia.
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
        <b>Casa Virtual 3D (tour)</b><br>
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

gui_ajuda_sobre['Sobre']();