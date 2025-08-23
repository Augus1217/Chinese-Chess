#include <iostream>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

#if defined(_MSC_VER)
#include <intrin.h>
#elif defined(__GNUC__)
#include <cpuid.h>
#endif

// Function to get CPUID info
void cpuid(int info[4], int infoType) {
#if defined(_MSC_VER)
    __cpuidex(info, infoType, 0);
#elif defined(__GNUC__)
    __cpuid_count(infoType, 0, info[0], info[1], info[2], info[3]);
#endif
}

bool has_ssse3() {
    int info[4];
    cpuid(info, 1);
    return (info[2] & (1 << 9)) != 0;
}

bool has_sse41() {
    int info[4];
    cpuid(info, 1);
    return (info[2] & (1 << 19)) != 0;
}

bool has_popcnt() {
    int info[4];
    cpuid(info, 1);
    return (info[2] & (1 << 23)) != 0;
}

bool has_avx() {
    int info[4];
    cpuid(info, 1);
    return (info[2] & (1 << 28)) != 0;
}

bool has_avx2() {
    int info[4];
    cpuid(info, 7);
    return (info[1] & (1 << 5)) != 0;
}

bool has_bmi2() {
    int info[4];
    cpuid(info, 7);
    return (info[1] & (1 << 8)) != 0;
}

bool has_avx512f() {
    int info[4];
    cpuid(info, 7);
    return (info[1] & (1 << 16)) != 0;
}

bool has_avx512bw() {
    int info[4];
    cpuid(info, 7);
    return (info[1] & (1 << 30)) != 0;
}

bool has_avx_vnni() {
     int info[4];
    cpuid(info, 7);
    return (info[3] & (1 << 4)) != 0; // Check for AVX-VNNI with EAX=7, ECX=1
}

bool has_avx512_vnni() {
    int info[4];
    cpuid(info, 7);
    return (info[2] & (1 << 11)) != 0;
}

int main() {
    nlohmann::json features;

    features["ssse3"] = has_ssse3();
    features["sse41-popcnt"] = has_sse41() && has_popcnt();
    features["avx2"] = has_avx2();
    features["bmi2"] = has_bmi2() && has_avx2(); // BMI2 usually comes with AVX2
    features["avxvnni"] = has_avx_vnni();
    features["avx512"] = has_avx512f(); // Simplified check for AVX512F
    features["bw512"] = has_avx512bw();
    features["vnni512"] = has_avx512_vnni();

    std::cout << features.dump() << std::endl;

    return 0;
}
