#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <pthread.h>
#include <sched.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <ucontext.h>
#include <unistd.h>

extern void gather_all_exact(const void *, const int32_t *, uint32_t *);
extern const unsigned char gather_all_fault_pc[];
extern void gather_exact(const void *, const int32_t *, const int32_t *,
                         const uint32_t *, uint32_t *);
extern void clamp_indices(const int32_t *, const int32_t *, int, int, int, int32_t *);
extern const unsigned char gather_fault_pc[];
static const unsigned ROUNDS = 4096;
struct arena { unsigned char *mapping, *data; size_t page, bytes, words; };
struct result { uint64_t checks; uint32_t checksum; int error; const char *stage; };
struct thread_arg { const struct arena *a; unsigned seed; int cpu; int affinity_ok; struct result r; };
static pthread_barrier_t barrier;

static void on_signal(int sig, siginfo_t *info, void *context) {
    (void)info;
    const ucontext_t *u = context;
    uintptr_t pc=(uintptr_t)u->uc_mcontext.gregs[REG_RIP];
    int site=pc==(uintptr_t)gather_all_fault_pc ? 0 :
             pc==(uintptr_t)gather_fault_pc ? 1 : 2;
    int kind=sig==SIGSEGV ? 0 : sig==SIGILL ? 1 : 2;
#define RECEIPT(signal_name,site_name) {"{\"signal\":\"" signal_name "\",\"gatherSite\":\"" site_name "\"}\n", sizeof("{\"signal\":\"" signal_name "\",\"gatherSite\":\"" site_name "\"}\n")-1}
    static const struct { const char *text; size_t len; } messages[3][3]={
        {RECEIPT("SIGSEGV","all_active"),RECEIPT("SIGSEGV","masked"),RECEIPT("SIGSEGV","other")},
        {RECEIPT("SIGILL","all_active"),RECEIPT("SIGILL","masked"),RECEIPT("SIGILL","other")},
        {RECEIPT("SIGBUS","all_active"),RECEIPT("SIGBUS","masked"),RECEIPT("SIGBUS","other")}
    };
#undef RECEIPT
    /* Literal compile-time lengths; no libc string calls or raw addresses. */
    (void)write(STDOUT_FILENO,messages[kind][site].text,messages[kind][site].len);
    _exit(128+sig);
}
static void fail(const char *s) { printf("{\"error\":\"%s\"}\n",s); exit(2); }
static struct arena make_arena(void) {
    struct arena a = {0}; long p=sysconf(_SC_PAGESIZE);
    if (p != 4096) fail("requires_4096_byte_pages");
    a.page=(size_t)p; a.bytes=64*a.page; a.words=a.bytes/4;
    a.mapping=mmap(NULL,a.bytes+2*a.page,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
    if (a.mapping==MAP_FAILED) fail("mmap");
    a.data=a.mapping+a.page;
    if (mprotect(a.data,a.bytes,PROT_READ|PROT_WRITE)) fail("mprotect_write");
    /* Byte-level initialization and scalar byte-load oracle avoid alignment/aliasing UB. */
    for(size_t i=0;i<a.bytes;++i) a.data[i]=(unsigned char)((i*131u)^(i>>8)^(i>>15)^0x5au);
    if(mprotect(a.data,a.bytes,PROT_READ)) fail("mprotect_read");
    return a;
}
static uint32_t next(unsigned *s) { *s=*s*1664525u+1013904223u; return *s; }
static int32_t clamp(int32_t v,int32_t hi) { return v<0?0:(v>hi?hi:v); }
static uint32_t scalar_load(const unsigned char *p) {
    const volatile unsigned char *v=p;
    return (uint32_t)v[0]|((uint32_t)v[1]<<8)|((uint32_t)v[2]<<16)|((uint32_t)v[3]<<24);
}
static int check(const struct arena *a, size_t base, const int32_t idx[8],
                 const int32_t mask[8], struct result *r, int inject) {
    uint32_t prior[8],out[8],want[8];
    for(int j=0;j<8;++j) {
        prior[j]=0x12340000u+(uint32_t)j;
        want[j]=prior[j];
        if(mask[j]<0) {
            int64_t offset=(int64_t)base+(int64_t)idx[j]*4;
            if(offset<0 || offset+4>(int64_t)a->bytes) {r->stage="oracle_bounds";r->error=1;return 1;}
            want[j]=scalar_load(a->data+offset);
        }
    }
    int all=1;for(int j=0;j<8;++j)if(mask[j]>=0)all=0;
    if(all)gather_all_exact(a->data+base,idx,out);
    else gather_exact(a->data+base,idx,mask,prior,out);
    if(inject) out[0]^=1;
    for(int j=0;j<8;++j) {
        if(out[j]!=want[j]) {r->stage=all?"gather_all_active_value":"gather_masked_value";r->error=1;return 1;}
        r->checksum=(r->checksum*33u)^out[j]; ++r->checks;
    }
    return 0;
}
static struct result suite(const struct arena *a,unsigned seed,int inject) {
    struct result r={0,0,0,"complete"};
    int32_t idx[8],mask[8],x[8],y[8],computed[8];
    for(int j=0;j<8;++j) mask[j]=-1;
    /* All-active first/last dword, duplicate lanes and neighboring page edges. */
    int32_t edges[8]={0,1,1023,1024,1025,65534,65535,65535};
    if(check(a,0,edges,mask,&r,inject)) return r;
    /* Signed negative indexes, all within the immutable live mapping. */
    int32_t signed_idx[8]={-32768,-1025,-1024,-1,0,1,1023,32767};
    if(check(a,a->bytes/2,signed_idx,mask,&r,0)) return r;
    /* Unaligned 4-byte accesses spanning readable pages, never guard pages. */
    int32_t crossing[8]={0,1,1023,1024,2047,2048,65533,65534};
    if(check(a,1,crossing,mask,&r,0)) return r;
    /* Mask uses the sign bit, not truthiness. Inactive lanes name guard pages. */
    int32_t masked_idx[8]={-1,65536,1024,65535,-1024,0,1,65536};
    int32_t mixed_mask[8]={0,INT32_MAX,INT32_MIN,-1,1,-123,-1,0};
    if(check(a,0,masked_idx,mixed_mask,&r,0)) return r;
    for(unsigned k=0;k<ROUNDS;++k) {
        for(int j=0;j<8;++j) idx[j]=(int32_t)(next(&seed) % a->words);
        if(check(a,0,idx,mask,&r,0)) return r;
        for(int j=0;j<8;++j) {
            x[j]=(int32_t)(next(&seed)%1024u)-384;
            y[j]=(int32_t)(next(&seed)%512u)-192;
        }
        if(k==0) { x[0]=INT32_MIN; x[1]=INT32_MAX; y[2]=INT32_MIN; y[3]=INT32_MAX; }
        /* Fixed safe image: width257, height129, stride263 pixels. */
        clamp_indices(x,y,256,128,263,computed);
        for(int j=0;j<8;++j) {
            idx[j]=clamp(x[j],256)+clamp(y[j],128)*263;
            if(computed[j]!=idx[j]) {r.stage="clamp_index";r.error=1;return r;}
            ++r.checks;
        }
        if(check(a,0,computed,mask,&r,0)) return r;
        if((k&31u)==0) sched_yield();
    }
    return r;
}
static void *thread_main(void *p) {
    struct thread_arg *t=p; cpu_set_t one; CPU_ZERO(&one);CPU_SET(t->cpu,&one);
    int affinity_error=pthread_setaffinity_np(pthread_self(),sizeof one,&one);
    cpu_set_t effective;CPU_ZERO(&effective);
    t->affinity_ok=!affinity_error &&
        !pthread_getaffinity_np(pthread_self(),sizeof effective,&effective) &&
        CPU_COUNT(&effective)==1 && CPU_ISSET(t->cpu,&effective);
    int br=pthread_barrier_wait(&barrier);
    if(!t->affinity_ok || (br!=0 && br!=PTHREAD_BARRIER_SERIAL_THREAD)) {
        t->r=(struct result){0,0,1,"thread_affinity_or_barrier"}; return NULL;
    }
    t->r=suite(t->a,t->seed,0); return NULL;
}
int main(int argc,char **argv) {
    struct rlimit core={0,0}; if(setrlimit(RLIMIT_CORE,&core)) fail("core_limit");
    struct sigaction sa={0};sa.sa_sigaction=on_signal;sa.sa_flags=SA_SIGINFO;
    if(sigemptyset(&sa.sa_mask)||sigaction(SIGSEGV,&sa,NULL)||sigaction(SIGBUS,&sa,NULL)||sigaction(SIGILL,&sa,NULL)) fail("signal_setup");
    __builtin_cpu_init();
    if(!__builtin_cpu_supports("avx2")) {puts("{\"error\":\"avx2_unavailable\"}");return 77;}
    if(argc!=2) fail("usage");
    struct arena a=make_arena();
    if(!strcmp(argv[1],"negative-gather")) {
        int32_t idx[8]={-1,0,0,0,0,0,0,0};
        uint32_t out[8];gather_all_exact(a.data,idx,out);fail("missing_expected_fault");
    }
    if(!strcmp(argv[1],"negative-scalar")) {
        volatile uint32_t v=*(volatile uint32_t *)(a.data-4);(void)v;fail("missing_expected_fault");
    }
    if(!strcmp(argv[1],"single")||!strcmp(argv[1],"mismatch-fixture")) {
        struct result r=suite(&a,0x2468ace0u,!strcmp(argv[1],"mismatch-fixture"));
        printf("{\"mode\":\"%s\",\"stage\":\"%s\",\"checks\":%"PRIu64",\"checksum\":%"PRIu32",\"rounds\":%u}\n",argv[1],r.stage,r.checks,r.checksum,ROUNDS);
        return r.error;
    }
    if(!strcmp(argv[1],"parallel")) {
        cpu_set_t available;CPU_ZERO(&available);
        if(sched_getaffinity(0,sizeof available,&available)) fail("get_affinity");
        int cpus[2]={-1,-1},n=0;
        for(int i=0;i<CPU_SETSIZE && n<2;++i) if(CPU_ISSET(i,&available))cpus[n++]=i;
        if(n!=2){puts("{\"error\":\"two_cpus_unavailable\"}");return 77;}
        if(pthread_barrier_init(&barrier,NULL,2))fail("barrier_init");
        struct thread_arg t[2]={{&a,0x2468ace0u,cpus[0],0,{0}},{&a,0x13579bdfu,cpus[1],0,{0}}};
        pthread_t ids[2];
        for(int i=0;i<2;++i)if(pthread_create(&ids[i],NULL,thread_main,&t[i]))fail("thread_create");
        for(int i=0;i<2;++i)if(pthread_join(ids[i],NULL))fail("thread_join");
        printf("{\"mode\":\"parallel\",\"threads\":2,\"distinctCpuAffinity\":%s,\"stage\":[\"%s\",\"%s\"],\"checks\":[%"PRIu64",%"PRIu64"],\"checksum\":[%"PRIu32",%"PRIu32"],\"rounds\":%u}\n",(t[0].affinity_ok && t[1].affinity_ok && t[0].cpu!=t[1].cpu)?"true":"false",t[0].r.stage,t[1].r.stage,t[0].r.checks,t[1].r.checks,t[0].r.checksum,t[1].r.checksum,ROUNDS);
        return t[0].r.error||t[1].r.error;
    }
    fail("unknown_mode");
}
