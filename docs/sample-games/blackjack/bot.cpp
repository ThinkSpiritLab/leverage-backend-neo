#include <iostream>
#include <regex>
#include <string>

int extract_total(const std::string& line) {
    static const std::regex total_pattern("\"total\"\\s*:\\s*([0-9]+)");
    std::smatch match;
    if (std::regex_search(line, match, total_pattern)) {
        return std::stoi(match[1].str());
    }
    return 0;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        int total = extract_total(line);
        std::string move = total >= 17 ? "STAND" : "HIT";
        std::cout << "{\"move\":\"" << move << "\",\"strategy\":\"cpp_stand_at_17\"}" << std::endl;
    }
    return 0;
}
