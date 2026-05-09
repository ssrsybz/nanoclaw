#version 460 core

precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec4 color = texture(uTexture, uv);
    fragColor = color;
}
