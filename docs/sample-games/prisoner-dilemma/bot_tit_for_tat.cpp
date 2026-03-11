#include <iostream>
#include <string>

// Tit-for-Tat: Cooperate first, then mirror opponent's last move.
// Parses JSON manually to avoid external dependencies.

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    std::string line;
    while (std::getline(std::cin, line)) {
        std::string move = "C";

        // Check if history is non-empty
        if (line.find("\"history\":[]") == std::string::npos) {
            // Find opponent id
            std::string opponent = "1";
            std::size_t opponent_pos = line.find("\"opponent\":");
            if (opponent_pos != std::string::npos) {
                std::size_t digit_pos = line.find_first_of("01", opponent_pos);
                if (digit_pos != std::string::npos) {
                    opponent = line.substr(digit_pos, 1);
                }
            }

            // Find last moves entry
            std::size_t moves_pos = line.rfind("\"moves\":{");
            if (moves_pos != std::string::npos) {
                std::string needle = "\"" + opponent + "\":\"";
                std::size_t value_pos = line.find(needle, moves_pos);
                if (value_pos != std::string::npos) {
                    std::size_t move_pos = value_pos + needle.size();
                    if (move_pos < line.size() && (line[move_pos] == 'C' || line[move_pos] == 'D')) {
                        move = std::string(1, line[move_pos]);
                    }
                }
            }
        }

        std::cout << "{\"move\":\"" << move << "\"}" << '\n';
        std::cout.flush();
    }

    return 0;
}
