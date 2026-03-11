#include <algorithm>
#include <cmath>
#include <iostream>
#include <regex>
#include <string>

int extractInt(const std::string& line, const std::string& key) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?\\d+)");
    std::smatch match;
    if (std::regex_search(line, match, pattern)) {
        return std::stoi(match[1].str());
    }
    return 0;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        int cardValue = extractInt(line, "cardValue");
        int budget = extractInt(line, "yourBudget");
        int roundsLeft = extractInt(line, "roundsLeft") + 1;

        int bid = static_cast<int>(std::ceil(cardValue * 0.9));
        if (cardValue >= 16) {
            bid += 5;
        } else if (cardValue <= 5) {
            bid = 1;
        }

        int reserve = std::max(0, budget - (roundsLeft - 1) * 3);
        bid = std::max(0, std::min(budget, std::min(bid, reserve)));

        std::cout << "{\"bid\":" << bid << "}\n" << std::flush;
    }

    return 0;
}
