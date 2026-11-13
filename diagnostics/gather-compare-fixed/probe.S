/* Synthetic SysV x86-64 helpers; no Electron/Skia code or data is linked. */
.text
.globl gather_all_exact
.type gather_all_exact,@function
gather_all_exact:
    mov %rdi,%rcx
    vmovdqu (%rsi),%ymm4
    /* Exact 15 bytes immediately ending in the original fault instruction. */
    .byte 0xc5,0xc5,0x76,0xff
    .byte 0xc4,0x41,0x38,0x57,0xc0
.globl gather_all_fault_pc
gather_all_fault_pc:
    .byte 0xc4,0x62,0x45,0x90,0x04,0xa1
    vmovdqu %ymm8,(%rdx)
    vzeroupper
    ret
.size gather_all_exact,.-gather_all_exact

.globl gather_exact
.type gather_exact,@function
gather_exact:
    mov %rcx,%rax
    mov %rdi,%rcx
    vmovdqu (%rsi),%ymm4
    vmovdqu (%rdx),%ymm7
    vmovdqu (%rax),%ymm8
.globl gather_fault_pc
gather_fault_pc:
    /* Exact verified fault encoding: vpgatherdd %ymm7,(%rcx,%ymm4,4),%ymm8 */
    .byte 0xc4,0x62,0x45,0x90,0x04,0xa1
    vmovdqu %ymm8,(%r8)
    vzeroupper
    ret
.size gather_exact,.-gather_exact

.globl clamp_indices
.type clamp_indices,@function
clamp_indices:
    vmovdqu (%rdi),%ymm3
    vmovdqu (%rsi),%ymm9
    vmovd %edx,%xmm2
    vpbroadcastd %xmm2,%ymm2
    vmovd %ecx,%xmm12
    vpbroadcastd %xmm12,%ymm12
    vmovd %r8d,%xmm14
    vpbroadcastd %xmm14,%ymm14
    vpxor %xmm11,%xmm11,%xmm11
    vpmaxsd %ymm11,%ymm3,%ymm1
    vpminsd %ymm2,%ymm1,%ymm13
    vpmaxsd %ymm11,%ymm9,%ymm1
    vpminsd %ymm12,%ymm1,%ymm1
    vpmulld %ymm14,%ymm1,%ymm1
    vpaddd %ymm1,%ymm13,%ymm4
    vmovdqu %ymm4,(%r9)
    vzeroupper
    ret
.size clamp_indices,.-clamp_indices
.section .note.GNU-stack,"",@progbits
